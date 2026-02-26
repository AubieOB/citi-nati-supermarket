# 🧪 AUTH IMPLEMENTATION TEST GUIDE

## ✅ IMPLEMENTATION SUMMARY

### Files Created:
1. **`src/utils/api.js`** - Axios configuration with auto token injection
2. **`src/utils/tokenStorage.js`** - localStorage management for token/user
3. **`AUTH_TEST_GUIDE.md`** (this file)

### Files Updated:
1. **`src/pages/public/Login.jsx`** - Real API integration
2. **`src/pages/public/Register.jsx`** - Real API integration
3. **`src/App.jsx`** - Token initialization on app startup
4. **`src/pages/public/Products.jsx`** - Uses api module + tokenStorage
5. **`src/pages/public/Cart.jsx`** - Uses api module + tokenStorage

### Key Features:
✅ Backend contract exact compliance  
✅ Automatic token injection via axios  
✅ Token initialization on app startup  
✅ No password logging (security)  
✅ No token decoding on frontend  
✅ 401 error handling (session expiry)  
✅ Form validation before API calls  

---

## 🧪 STEP-BY-STEP TEST PROCEDURE

### STEP 1: CLEAR BROWSER STATE
1. Open DevTools: **F12**
2. Go to: **Application → Local Storage**
3. **Delete all** values (if any exist from previous tests)
4. Refresh page: **Ctrl+R**

---

### STEP 2: REGISTER NEW USER
1. Navigate to: **http://localhost:3000/register**
2. Fill form with:
   - **Name:** `Test User`
   - **Email:** `testuser@example.com`
   - **Password:** `Test123!`
   - **Confirm Password:** `Test123!`
3. Click **Create Account**
4. Expected result:
   - ✅ Green success message: "Account created successfully! Redirecting to login..."
   - ✅ Auto-redirect to login page after 2 seconds

**If failed:**
- ❌ 400 error: Check email uniqueness (use timestamp: `testuser+{timestamp}@example.com`)
- ❌ 500 error: Backend server issue (check backend console)

---

### STEP 3: VERIFY REGISTRATION IN DATABASE
**Optional - Backend verification:**
```bash
# Connect to database and check users table
# Should see the new user with id, name, email, and hashed password
```

---

### STEP 4: LOGIN WITH REGISTERED USER
1. You should already be on: **http://localhost:3000/login**
2. Fill form with:
   - **Email:** `testuser@example.com`
   - **Password:** `Test123!`
3. Click **Sign In**
4. Expected result:
   - ✅ Auto-redirect to home page (`/`)
   - ✅ No error messages

**If failed:**
- ❌ 401 error: "Invalid email or password" → Check credentials are correct
- ❌ 400 error: "Please enter both email and password" → Both fields required
- ❌ 500 error: Backend server issue

---

### STEP 5: VERIFY localStorage CONTAINS TOKEN & USER
1. Open DevTools: **F12**
2. Go to: **Application → Local Storage → http://localhost:3000**
3. You should see **TWO** entries:

**Entry 1: `token`**
```
Value: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpX...
(Long JWT string - do not decode on frontend)
```

**Entry 2: `user`**
```
Value: {"id":"...","email":"testuser@example.com","name":"Test User","role":"USER"}
```

✅ **If both exist with correct values:** Auth setup is WORKING  
❌ **If missing:** Check Login.jsx error handling

---

### STEP 6: VERIFY AXIOS AUTHORIZATION HEADER
1. Keep DevTools open
2. Go to: **Network** tab
3. Click on any **XHR/Fetch** request after login
4. Look for **Request Headers** section
5. You should see:
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpX...
```

✅ **If header present:** api.js configuration is WORKING  
❌ **If header missing:** Check api.js setAuthToken call after login

---

### STEP 7: TEST ADD TO CART (AUTHENTICATED)
1. Navigate to: **http://localhost:3000/products**
2. Wait for products to load
3. Click **Add to Cart** on any product
4. Expected result:
   - ✅ Success alert: "{Product Name} added to cart!"
   - ✅ No 401 error (token should be sent automatically)

**Network verification:**
1. Open DevTools → **Network** tab
2. Add to cart again
3. Find **POST /api/cart** request
4. Check **Request Headers**: Must include
   ```
   Authorization: Bearer <token>
   Content-Type: application/json
   ```
5. Check **Request Body**: Must be
   ```json
   { "productId": "...", "quantity": 1 }
   ```

✅ **If header & body correct:** Add-to-Cart integration is WORKING  
❌ **If header missing:** Token not being injected

---

### STEP 8: TEST VIEW CART (AUTHENTICATED)
1. Navigate to: **http://localhost:3000/cart**
2. Expected result:
   - ✅ Cart loads with items
   - ✅ Displays prices in **MWK format** (e.g., `MWK 5,000`)
   - ✅ Shows backend total (never shows calculated total)

**Network verification:**
1. Open DevTools → **Network** tab
2. Refresh cart or change quantity
3. Find **GET /api/cart** request
4. Check **Request Headers**: Must include
   ```
   Authorization: Bearer <token>
   ```

✅ **If Authorization header present:** Cart authentication WORKING  
❌ **If header missing:** Check api module initialization

---

### STEP 9: TEST LOGOUT (SESSION EXPIRY SIMULATION)
1. Open DevTools → **Application → Local Storage**
2. **Delete** the `token` entry (simulate session expiry)
3. Try to add to cart: Click **Add to Cart** on any product
4. Expected result:
   - ✅ Alert: "Please log in to add items to your cart"
   - ✅ Request is NOT sent to API (guarded by tokenStorage.isLoggedIn())

---

### STEP 10: TEST 401 ERROR HANDLING
**Manual test:**
1. Add to cart successfully (so token exists)
2. Open DevTools → **Application → Local Storage**
3. **Modify token** to invalid value: Change one character in the token string
4. Try to add another item to cart
5. Expected result:
   - ✅ Alert: "Error adding to cart: ..." OR "Session expired. Please log in again."
   - ✅ Token cleared from localStorage after 401
   - ✅ Next request has no Authorization header (since token was cleared)

---

## 🚨 COMMON ISSUES & SOLUTIONS

### Issue 1: "Cannot read property 'getItem' of undefined"
**Cause:** localStorage not available  
**Solution:** Make sure running in browser, not Node.js

### Issue 2: "token is not defined" errors
**Cause:** Old code still referencing `localStorage.getItem('token')`  
**Solution:** Use `tokenStorage.getToken()` or `tokenStorage.isLoggedIn()`

### Issue 3: Authorization header not appearing in Network tab
**Cause:** api module not being used  
**Solution:** 
- Check Products.jsx uses `import api from '../../utils/api.js'`
- Check Cart.jsx uses `import api from '../../utils/api.js'`
- Ensure fetch() is replaced with api.get/post/put

### Issue 4: CORS error on login
```
Access to XMLHttpRequest blocked by CORS policy
```
**Cause:** Backend doesn't have CORS headers or running on different port  
**Solution:**
- Backend should be on `http://localhost:5000`
- Check backend has CORS middleware enabled
- Check `api.js` baseURL is `http://localhost:5000/api`

### Issue 5: Cannot set Authorization header with fetch()
**Cause:** fetch() doesn't auto-include headers like axios  
**Solution:** Use `api` module which handles this automatically

---

## ✅ COMPLIANCE CHECKLIST

- [ ] Register endpoint: `POST /api/auth/register`
- [ ] Register sends: `{ name, email, password }` only
- [ ] Register doesn't send: `role`, `confirmPassword`, `id`
- [ ] Login endpoint: `POST /api/auth/login`
- [ ] Login sends: `{ email, password }` only
- [ ] Login response stores: `token` + `user` object
- [ ] Token auto-injected on all authenticated requests
- [ ] Token initialized on app startup (from localStorage)
- [ ] No token decoding on frontend
- [ ] No password logging (console.log check)
- [ ] 401 errors clear stored token
- [ ] Form validation before API calls
- [ ] No role modification on frontend
- [ ] localStorage has `token` and `user` after login

---

## 🧠 IMPLEMENTATION ARCHITECTURE

```
App.jsx (startup)
    ↓
useEffect → initializeAuth()
    ↓
api.js → Check localStorage for token
    ↓
IF token exists → Set axios default header automatically
    ↓
All API calls via api module automatically include Authorization header

Login.jsx (user submits form)
    ↓
userValidation.validateLogin()
    ↓
api.post('/auth/login', { email, password })
    ↓
Response: { token, user: {...} }
    ↓
tokenStorage.setToken(token)
tokenStorage.setUser(user)
setAuthToken(token)
    ↓
Navigate to home
```

---

## 📝 NOTES

**What was implemented per backend contract:**
- ✅ Register: POST /api/auth/register { name, email, password }
- ✅ Login: POST /api/auth/login { email, password }
- ✅ Token auto-injection: Handled by api.js
- ✅ localStorage: { token, user }
- ✅ Error handling: 400, 401, 500 status codes
- ✅ Session expiry: 401 clears token
- ✅ Validation: userValidation before API calls

**What was NOT implemented (not in auth scope):**
- ❌ Password reset endpoint
- ❌ Token refresh mechanism
- ❌ Social login
- ❌ Two-factor authentication

---

## 📞 DEBUGGING TIPS

1. **Check browser console** for error messages
2. **Check Network tab** to see actual API requests/responses
3. **Check Application → Local Storage** to verify token stored
4. **Check HTTP headers** to verify Authorization header sent
5. **Never log passwords or tokens** in console (security risk)

---

**Backend Contract Reference:** `src/contracts/backendContract.md`  
**API Quick Reference:** `src/contracts/API_QUICK_REFERENCE.md`  
**Alignment Rules:** `src/contracts/ALIGNMENT_RULES.md`
