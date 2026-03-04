# POS Sync Management Panel - Complete Guide

## Overview

The new **POS Sync Management Panel** is an admin-only tool that gives you complete control over which POS synced products appear on your website. This feature allows you to:

- 👁️ **Hide/Show Products** - Toggle visibility of individual products
- 🔍 **Search Products** - Find products by name, source code, or category
- 🗑️ **Delete Selected** - Remove specific products from your website
- ⚠️ **Delete All POS** - Clear all POS synced products at once
- 📊 **Paginated View** - Browse through products efficiently

---

## Accessing the Panel

### Step 1: Login as Admin
- Go to your website and login with an admin account
- Navigate to the admin dashboard

### Step 2: Find POS Management Tab
In the admin sidebar, click on **"POS Management"** tab (looks like a database icon 🗄️)

### Step 3: View Your Products
You'll see a table of all POS synced products with:
- Product name
- Source code (unique POS identifier)
- Category
- Price
- Stock level
- Current visibility status
- Action buttons

---

## Features Explained

### 1. Search Bar
Located at the top of the page, search by:
- **Product Name** - Type any part of the product name
- **Source Code** - Type the POS source code
- **Category** - Type the product category

**Example searches:**
```
"yoghurt"     → Finds all yoghurt products
"4250191"     → Finds by source code
"beverages"   → Finds by category
```

### 2. Toggle Product Visibility

#### Hide from Products Page
1. Find the product in the table
2. Click the **"Hide"** button in the Action column
3. The product will be hidden from your website immediately
4. Status will change to 🚫 **HIDDEN**

#### Show on Products Page
1. Find the hidden product (search for it)
2. Click the **"Show"** button
3. The product will reappear on your website
4. Status will change to ✅ **VISIBLE**

**What happens when hidden:**
- Product disappears from Products page
- Not included in search results
- Customers can't find or purchase it
- Stock level not updated on frontend
- Product remains in your database

### 3. Delete Selected Products

#### Select Products to Delete
1. Check the checkbox next to product(s) you want to delete
2. Or click the checkbox in the table header to select ALL on current page

#### Delete Them
1. Click the **"🗑️ Delete Selected (X)"** button
2. Confirm the deletion when prompted
3. Products are removed from your website

**What happens:**
- Products are permanently deleted from website
- They will **re-sync automatically** next time POS Agent runs (every 30 seconds)
- Only deleted from your website database, NOT from POS

---

### 4. Delete ALL POS Products

#### Clear Entire Database
1. Click the **"⚠️ Delete All POS Products (X)"** button at top
2. Read the confirmation carefully
3. Confirm the mass deletion

**What happens:**
- ALL POS synced products deleted from website
- Website shows 0 POS products temporarily
- POS Agent will re-sync automatically in ~30 seconds
- Fresh products appear without old data

**Use cases:**
- Clear old/test data and start fresh
- Remove duplicates before re-syncing
- Prepare for a major product update

---

## Status Indicators

### Product Status Colors

| Status | Color | Meaning |
|--------|-------|---------|
| ✅ VISIBLE | Green | Product showing on products page |
| 🚫 HIDDEN | Yellow | Product hidden from products page |
| In Stock | Light Green | Stock > 0 |
| Out of Stock | Light Red | Stock = 0 |

---

## Pagination

### Navigate Through Products

**Next/Previous Buttons:**
- Click **"Next"** to go to next page
- Click **"Previous"** to go to previous page
- Buttons are disabled when at first/last page

**Page Information:**
Shows: "Page X of Y (Total products)"

Example: "Page 2 of 15 (287 total products)"

---

## How It Works Behind the Scenes

### Database Field
A new field `hideFromProductsPage` (Boolean) tracks visibility:
- `true` = Hidden from products page
- `false` = Visible to customers

### Frontend Filtering
The Products page automatically filters:
- Excludes products where `hideFromProductsPage = true`
- Applies to all product displays (search, filters, categories)

### Real-Time Updates
Changes are instant:
- Toggle visibility → Product disappears/appears immediately
- Delete products → Gone instantly
- No page refresh needed

---

## Common Tasks

### Task: Hide all YOGHURT products temporarily

```
1. Search: "yoghurt"
2. Click checkbox in table header (select all shown)
3. Click "Delete Selected" button... NO! Click "Hide" for each:
   - Click "Hide" on first yoghurt
   - Scroll to next, click "Hide"
   - Repeat for each
4. OR select all and delete, they'll re-sync fresh
```

### Task: Remove out-of-stock products from view

```
1. Look for products with "Stock: 0"
2. Click "Hide" button for each
3. They'll still sync, but won't show to customers
4. When stock updates, toggle "Show" to re-enable
```

### Task: Clean database before major re-sync

```
1. Click "Delete All POS Products"
2. Confirm the warning
3. Wait 30 seconds
4. All fresh products sync from POS
5. No duplicates or old data
```

### Task: Find and delete a specific product

```
1. Search by name/code in search bar
2. Find the product in results
3. Check its checkbox
4. Click "Delete Selected"
5. Confirm deletion
6. Done!
```

---

## Troubleshooting

### Problem: Can't find product in search
**Solution:**
- Try different search terms (name, code, category)
- Check spelling carefully
- Use partial matches (e.g., "yogh" for "yoghurt")
- Try pagination to browse manually

### Problem: Product reappears after deletion
**Solution:**
This is expected! POS Agent syncs every 30 seconds:
1. Delete product from website
2. Deleted immediately
3. POS Agent detects it's missing
4. Re-syncs it from POS database
5. Product reappears

**To prevent this:**
- Use "Hide" instead of "Delete" if you want to keep POS data
- Or delete all and don't run POS Agent for a while

### Problem: Visibility toggle not working
**Solution:**
- Page might be loading, wait a moment
- Try refreshing page (Ctrl+R)
- Check browser console for errors (F12)
- Log out and back in

### Problem: Deleted products but they're still showing
**Solution:**
- Clear browser cache (Ctrl+Shift+Delete)
- Hard refresh page (Ctrl+Shift+R)
- Wait a few seconds and refresh again
- Check if POS Agent re-synced them

---

## Important Notes

⚠️ **READ BEFORE DELETING:**

1. **Hidden ≠ Deleted**
   - Hide: Product hidden from view but kept in database
   - Delete: Product removed from database

2. **POS Sync Always Wins**
   - If you delete, POS Agent will re-sync it
   - Use "Hide" for temporary removal

3. **No Undo**
   - Deletions are permanent
   - No recycle bin or recovery
   - Only way to undo is if POS Agent re-syncs

4. **Website Only**
   - Deleting from website doesn't touch your POS database
   - POS system is never modified
   - It's read-only from the website perspective

5. **Bulk Actions Affect All Pages**
   - "Delete All" deletes from entire database, not just current page
   - "Hide All" would need individual selection

---

## Statistics

### What You'll See

**Total Products Count:** Shows all POS products in database
**Current Page:** Which page you're viewing
**Selection Count:** How many products selected for action
**Status Indicators:** Real-time visibility status

---

## Protected Features

All POS Management features are:
- ✅ **Admin Only** - Regular users can't access
- ✅ **Authenticated** - Must be logged in
- ✅ **Secure** - CSRF protection enabled
- ✅ **Audited** - All actions logged in backend

---

## API Endpoints (For Developers)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/admin/pos-products?search=&page=&limit=` | Fetch POS products |
| PUT | `/api/admin/pos-products/:id/visibility` | Toggle visibility |
| DELETE | `/api/admin/pos-products/delete-selected` | Delete selected |
| DELETE | `/api/admin/pos-products/delete-all` | Delete all |

---

## Performance

- **Pagination:** 20 products per page (fast loading)
- **Search:** Real-time filtering (instant results)
- **Bulk Delete:** Processes multiple products efficiently
- **UI:** Responsive design (works on mobile/tablet)

---

## Best Practices

✅ **DO:**
- Use search to find specific products
- Hide products temporarily instead of deleting
- Test with one product before bulk actions
- Check confirmation dialogs carefully

❌ **DON'T:**
- Delete all products unless you know what you're doing
- Rely on deletion to prevent POS re-syncing (it will re-sync)
- Forget to confirm dialogues before clicking away
- Click multiple times rapidly (causes loading issues)

---

## Future Enhancements

Planned features for next versions:
- [ ] Bulk hide/show multiple products at once
- [ ] Export products list as CSV
- [ ] Schedule product hiding (time-based)
- [ ] Duplicate detection and removal
- [ ] Product categorization management
- [ ] Stock level alerts

---

## Questions?

Check these resources:
1. Admin Dashboard main panel
2. Render backend logs (for server errors)
3. Browser console (F12) for client errors
4. POS Sync System documentation

## Support

For issues or questions:
1. Check this guide first
2. Review backend logs in Render dashboard
3. Check frontend console (F12)
4. Contact development team

---

**System Status:** ✅ OPERATIONAL  
**Last Updated:** March 4, 2026  
**Version:** 1.0 - Initial Release

