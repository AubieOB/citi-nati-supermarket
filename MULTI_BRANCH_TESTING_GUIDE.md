# Multi-Branch Location Support - Quick Verification Guide

## Overview

This guide provides step-by-step instructions to verify that multi-branch location support is working correctly across the Business Operations module.

---

## Prerequisites

- Backend server running and accessible
- Frontend server running and accessible  
- Logged in as admin user
- Have data in multiple location branches (or be able to add test data)

---

## Quick Test - Location Selector Functionality

### Test 1: Location Selector Loads

1. Navigate to **Business Operations** in admin sidebar
2. Look at the header section
3. **Verify**: Location Scope dropdown appears with options:
   - ✅ "All Locations"
   - ✅ "Blantyre (BT)" 
   - ✅ "Zomba (ZA)"

### Test 2: Location Selection Persists

1. From location dropdown, select **"Blantyre"**
2. Click on **Sales Reports** tab
3. **Verify**: Dropdown still shows "Blantyre" (selection persists)

---

## Detailed Testing by Tab

### Test 3: Sales Reports - Location Filtering

**Scenario**: Data exists for both Blantyre and Zomba

1. Go to **Sales Reports** tab
2. Select **"All Locations"** from Location Scope dropdown
   - **Verify**: See totals for combined data (all branches)
3. Select **"Blantyre"** from Location Scope dropdown
   - **Verify**: Data immediately refreshes
   - **Verify**: Totals are lower (only Blantyre data)
   - **Verify**: Drilldown tables show only Blantyre transactions
4. Select **"Zomba"** from Location Scope dropdown
   - **Verify**: Data immediately refreshes
   - **Verify**: Different totals (Zomba data only)
5. Switch back to **"All Locations"**
   - **Verify**: Combined totals return

**Expected Behavior**:
- No page reload needed
- Location change triggers immediate data refresh
- Cards/totals update immediately
- Tables update immediately

---

### Test 4: Suppliers - Location Filtering

1. Go to **Suppliers** tab
2. Select **"Blantyre"** from Location Scope
   - **Verify**: Supplier list shows only Blantyre suppliers
   - **Verify**: Totals show Blantyre data only
3. Create a test supplier
   - **Verify**: New supplier gets Blantyre location
4. Switch to **"Zomba"**
   - **Verify**: Supplier list shows only Zomba suppliers
   - **Verify**: Previously created supplier is gone (location filtered)
5. Add supplier transaction
   - **Verify**: Transaction form includes location
   - **Verify**: Transaction gets Zomba location
6. Switch to **"All Locations"**
   - **Verify**: Both Blantyre and Zomba suppliers appear

---

### Test 5: Expenses - Location Filtering

1. Go to **Expenses** tab
2. Select **"Blantyre"**
   - **Verify**: Expense list shows Blantyre only
   - **Verify**: Summary card shows Blantyre totals
3. Create test expense
   - **Verify**: Saves with Blantyre location
4. Switch to **"Zomba"**
   - **Verify**: Lists reloads with Zomba data
   - **Verify**: Previously created expense not visible
5. Switch to **"All Locations"**
   - **Verify**: All expenses appear

---

### Test 6: Employees - Location Filtering

1. Go to **Employees** tab
2. Select **"Blantyre"**
   - **Verify**: Only Blantyre employees appear
   - **Verify**: Count matches expected
3. Create test employee
   - **Verify**: Assigned to Blantyre location
4. Switch to **"Zomba"**
   - **Verify**: Different employee list loaded
5. Go back to **"Blantyre"**
   - **Verify**: Created employee appears

---

### Test 7: Payroll - Location Filtering

1. Go to **Payroll** tab
2. Select **"Blantyre"**
   - **Verify**: Only Blantyre payroll periods appear
   - **Verify**: Entry list shows Blantyre employees only
3. Create test payroll period
   - **Verify**: Period gets Blantyre location
4. Switch locations
   - **Verify**: Payroll data re-filters correctly
5. Return to **"Blantyre"**
   - **Verify**: Created period visible

---

### Test 8: Monthly Summary - Aggregation by Location

1. Go to **Monthly Summary** tab
2. Select **"Blantyre"**
   - **Verify**: Summary cards update
   - **Verify**: All sub-sections show Blantyre data:
     - Sales summary (Blantyre only)
     - Expenses total (Blantyre only)
     - Payroll total (Blantyre only)
     - Supplier data (Blantyre only)
3. Click "Drilldown" buttons (if available)
   - **Verify**: Drilldown tabs open with Blantyre pre-selected
4. Switch to **"Zomba"**
   - **Verify**: All sections update to show Zomba data
   - **Verify**: Totals are different from Blantyre

---

### Test 9: Report History - Location Filtering

1. Go to **Report History** tab
2. Select **"Blantyre"**
   - **Verify**: Recent activity shows Blantyre transactions
   - **Verify**: Invoices, expenses, transactions are Blantyre-filtered
3. Switch to **"Zomba"**
   - **Verify**: Activity list refreshes with Zomba data
4. Switch to **"All Locations"**
   - **Verify**: Recent activity from both locations appears

---

## Integration Test: Location Change Triggers Refresh

1. Navigate to **Suppliers** tab
2. Observe supplier list (note the count)
3. Switch location from **"Blantyre"** to **"Zomba"**
4. **Verify**: 
   - ✅ List refreshes automatically (no manual refresh button needed)
   - ✅ Supplier count changes
   - ✅ Different suppliers appear
   - ✅ Spinner/loading appears briefly during refresh
5. Switch again to **"All Locations"**
6. **Verify**: Combined list appears

---

## Import + Location Test

1. Go to **Business Operations** → Import button
2. Upload workbook with data for one location (e.g., Blantyre)
3. Complete import
4. **Verify**: Data appears in correct location tab
5. Go to **Sales Reports** tab
6. Select **"Blantyre"**
7. **Verify**: Imported data visible in reports
8. Select **"Zomba"**
9. **Verify**: Imported data not visible (location filtered)

---

## API Verification (Browser DevTools)

### Test Location Parameters in Network Tab

1. Open **Browser DevTools** → **Network** tab
2. Go to **Business Operations** → **Sales Reports**
3. Select **"Blantyre"** from location dropdown
4. In Network tab, look for API requests like:
   ```
   /business-operations/reports/sales/summary?...&locationId=1
   ```
5. **Verify**: `locationId=1` appears in query string (Blantyre = id 1)
6. Select **"Zomba"**
7. **Verify**: New request shows `locationId=2` (Zomba = id 2)
8. Select **"All Locations"**
9. **Verify**: New request has no `locationId` parameter (or undefined)

### Response Verification

1. Click on API request in Network tab
2. Go to **Preview** tab
3. **Verify**: Response data matches selected location
   - Blantyre selected → response contains Blantyre records only
   - Zomba selected → response contains Zomba records only
   - All Locations → response contains combined records

---

## Common Issues & Troubleshooting

### Issue: Location selector appears empty

**Check**:
- Backend `/business-operations/locations` endpoint is reachable
- `business_locations` table exists or fallback defaults load
- Check browser console for any fetch errors

**Solution**: Backend should return at minimum:
```json
{
  "success": true,
  "data": [
    { "id": 1, "code": "BT", "name": "Blantyre" },
    { "id": 2, "code": "ZA", "name": "Zomba" }
  ]
}
```

---

### Issue: Changing location doesn't refresh data

**Check**:
- Browser console for any errors
- Network tab for API requests being made
- Verify `locationRefreshKey` is updated in React state

**Solution**:
1. Hard refresh page (Ctrl+F5)
2. Check browser console for errors
3. Verify backend is returning filtered data

---

### Issue: All data appears regardless of location selection

**Check**:
- Verify API requests include `locationId` parameter
- Check backend filters actually apply

**Solution**:
1. Open Network tab
2. Verify request URL includes `?locationId=X`
3. If not, ensure tab is receiving `selectedLocationId` prop
4. Check backend service filters in code

---

### Issue: "All Locations" shows wrong data

**Check**:
- Backend should return all records when `locationId` is not provided

**Solution**:
1. Verify request has no `locationId` parameter
2. Backend logic should skip location filter if `locationId` is null/undefined
3. Verify database has data from multiple locations

---

## Performance Checklist

- [ ] Location change causes immediate refresh (< 1 second)
- [ ] No unnecessary API calls on location change
- [ ] Tables update smoothly without flicker
- [ ] No loading spinner hangs
- [ ] No console error messages

---

## Success Criteria

✅ **All of these must pass for complete verification:**

1. Location selector shows all 3 options
2. Each tab reflects location selection in data
3. Switching location triggers automatic refresh
4. "All Locations" shows combined data
5. Individual locations show filtered data only
6. No page reload required for location changes
7. Import respects location filtering
8. All tabs (Sales, Suppliers, Expenses, Employees, Payroll, Summary, History) work correctly
9. No errors in browser console
10. API requests include correct `locationId` parameter

---

## Next Steps

If everything works:
- ✅ Production ready for multi-branch operations
- ✅ Users can now filter all reports by branch
- ✅ Each branch can see only their data

If issues found:
- 📋 Check troubleshooting section above
- 🔍 Enable browser DevTools debugging
- 🐛 Report specific error messages found in console

---

**Last Updated**: After commit d97bfac

