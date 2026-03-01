# Race Condition Fix - Atomic Stock Validation

## The Problem 🚨

**Before Fix:** Two users could buy the last unit of a product, both successfully completing orders.

```
Time    | User A                              | User B                              | DB Stock
--------|-------------------------------------|-------------------------------------|----------
T1      | Webhook: Order 1 payment confirmed | -                                   | 1
T2      | SELECT stock FROM Product WHERE... | -                                   | 1 ✓ (read)
T3      | Check: stock(1) >= qty(1)? YES     | -                                   | 1
T4      | -                                   | Webhook: Order 2 payment confirmed | 1
T5      | -                                   | SELECT stock FROM Product WHERE... | 1 ✓ (read)
T6      | -                                   | Check: stock(1) >= qty(1)? YES     | 1
T7      | UPDATE stock = 1 - 1 = 0           | -                                   | ✓ (write)
T8      | -                                   | UPDATE stock = 1 - 1 = 0           | ✓ (write) ❌ WRONG!
```

**Why it happened:** Both transactions read the stock value (1) before either wrote their decrement, allowing both to pass validation.

---

## The Solution ✅

**After Fix:** Atomic UPDATE with WHERE clause validates and decrements in ONE database operation.

```sql
UPDATE "Product"
SET stock = stock - ?
WHERE id = ? AND stock >= ?
RETURNING id, stock, price
```

### How it works:

```
Time    | User A                              | User B                              | DB Stock
--------|-------------------------------------|-------------------------------------|----------
T1      | Webhook: Order 1 payment confirmed | -                                   | 1
T2      | ATOMIC UPDATE ... WHERE stock >= 1 | -                                   | (locked)
T3      | -                                   | Webhook: Order 2 payment confirmed | (locked)
T4      | UPDATE succeeds ✓                   | -                                   | 0 ✓
T5      | -                                   | ATOMIC UPDATE ... WHERE stock >= 1 | (read stock=0)
T6      | -                                   | UPDATE fails (0 rows affected)      | 0
T7      | -                                   | Throws error: "Insufficient stock"  | 0 ❌ Order rejected
        | Order 1: SUCCESS ✓                 | Order 2: FAILED ❌                  |
```

**Key Advantages:**
- ✅ Validation and decrement are **ONE atomic operation** at DB level
- ✅ No race condition window between read and write
- ✅ Automatically prevents overselling
- ✅ Works across multiple concurrent payment webhooks
- ✅ No special locking needed, uses standard SQL

---

## Testing Procedure

### Scenario 1: Last Unit (Critical Test)

1. **Setup:** Product ID 16 has exactly **1 unit** in stock
2. **Action:** Simulate 2 users buying simultaneously
   ```bash
   # Terminal 1:
   curl -X POST http://localhost:5000/api/orders/check-payment \
     -H "Authorization: Bearer TOKEN_A" \
     -d '{"reference":"PAY_USER_A"}'
   
   # Terminal 2 (same time):
   curl -X POST http://localhost:5000/api/orders/check-payment \
     -H "Authorization: Bearer TOKEN_B" \
     -d '{"reference":"PAY_USER_B"}'
   ```

3. **Expected Result:**
   - ✅ Order A: SUCCESS (stock becomes 0)
   - ❌ Order B: FAILURE with message `"Insufficient stock for product 16. Available: 0, Requested: 1"`

4. **Verification in logs:**
   ```
   [PAYMENT CHECK] ✅ Atomic UPDATE succeeded for product 16: stock reduced to 0
   [PAYMENT CHECK] ❌ Atomic UPDATE failed for product 16: Insufficient stock...
   ```

---

### Scenario 2: Sufficient Stock (Should Both Succeed)

1. **Setup:** Product ID 15 has exactly **2 units** in stock
2. **Action:** 2 users buy 1 unit each simultaneously
3. **Expected Result:**
   - ✅ Order A: SUCCESS (stock becomes 1)
   - ✅ Order B: SUCCESS (stock becomes 0)

---

### Scenario 3: Multi-Product Order (1 Out of Stock)

1. **Setup:**
   - Product A: 1 unit
   - Product B: 1 unit
   - Order contains both products

2. **Action:** 2 users buy simultaneously
3. **Expected Result:**
   - ✅ One order succeeds (gets both products)
   - ❌ Other order fails with intelligible error message indicating which product is out of stock

---

## Technical Details

### SQL Breakdown:
```sql
UPDATE "Product"
SET stock = stock - 1              -- Decrement
WHERE id = 16 AND stock >= 1       -- Validate (atomic!)
RETURNING id, stock, price         -- Return results
```

**Why this is atomic:**
- Database executes as single operation
- Validation happens at database level, not application level
- If condition fails, no update occurs
- Two concurrent transactions cannot both pass the `stock >= qty` check if stock < qty

### Error Handling:
If `UPDATE` returns 0 rows:
```javascript
if (!updated) {
  // Get current stock for better error message
  const currentProduct = await tx.product.findUnique({...});
  throw new Error(`Insufficient stock for product ${id}. Available: ${currentProduct.stock}, Requested: ${qty}`);
}
```

---

## Logs to Monitor

When testing, watch for these log patterns:

**Success Case:**
```
[PAYMENT CHECK] ✅ Atomic UPDATE succeeded for product 16: stock reduced to 0
[PAYMENT CHECK] ✅ Stock update emitted for product 16
Order confirmed: PAID status
```

**Failure Case:**
```
[PAYMENT CHECK] ❌ Atomic UPDATE failed for product 16: Insufficient stock for product 16. Available: 0, Requested: 1
[PAYMENT CHECK] 🚨 Atomic transaction failed: Insufficient stock...
Error response: [400] Insufficient stock...
```

---

## Commit Info

**Hash:** `{commit_hash}`  
**Message:** "fix: Implement atomic UPDATE for race-condition-proof stock validation"

**Files Modified:**
- `src/controllers/order.controller.js` - Changed stock validation from read-then-write to atomic UPDATE

---

## References

- **Pattern:** Optimistic Locking with Atomic UPDATE
- **Problem:** Read-Write Race Condition (TOCTOU - Time-of-Check to Time-of-Use)
- **Solution:** Combine validation with write operation at database level
- **Database Support:** Works in PostgreSQL, MySQL, SQLite (all supporting UPDATE...WHERE...RETURNING)
