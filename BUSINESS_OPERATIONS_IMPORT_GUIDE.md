# Business Operations Excel Import Workflow

## Overview

Admin users can now upload, preview, and import Excel workbooks directly from the Business Operations module, without needing Postman or manual data entry.

## How to Use

### Step 1: Launch Import Modal
- Open **Business Operations** from the admin sidebar
- Click the **Import Workbook** button in the top-right corner

### Step 2: Select Workbook Type
Choose between:
- **Payroll Workbook** – Contains employee master data, salary structures, payroll entries, loans, terminations, etc.
- **Business Workbook** – Contains suppliers, transactions, expense categories, and expense records

### Step 3: Upload File
- Select an `.xlsx` or `.xls` file (max 20MB)
- File must match the selected workbook type
- Click **Preview Parse** to analyze the workbook structure

### Step 4: Review Parse Preview
See detected information:
- **Detected Entities** – Summary count of employees, suppliers, expenses, etc.
- **Detected Sheets** – List of recognized sheets that will be imported
- **Sheet Variants** – Additional sheets found but not imported in this phase
- **Warnings** – Any data quality concerns
- **Errors** – Critical parse failures

### Step 5: Select Sections to Import
After preview succeeds, choose:
- Individual sections (Employees, Loans, Suppliers, Expenses, etc.)
- Or use **Select All** to import everything
- Only sections with detected data are selectable
- Each section shows the record count

### Step 6: Execute Import
- Click **Import Now** to run the import
- System sends selected sections to backend
- Live progress indicator shows import is running

### Step 7: Review Results
After import completion, see:
- **Success/Warning Status** – Overall import outcome
- **Results by Section** – Parsed, Inserted, Updated, Skipped counts per entity
- **Warnings & Errors** – Per-section issues if any
- **Next Steps** – Import another workbook or view imported data

## Supported Workbook Types

### Payroll Workbook Sections
- Employees
- Salary Structures
- Payroll Periods
- Payroll Entries
- Loans
- Loan Transactions
- Terminations
- Reengagements

### Business Workbook Sections
- Suppliers
- Supplier Transactions
- Expense Categories
- Expenses

## Features

### Safety First
- **Preview before import** – No data is imported until you confirm
- **Staged imports** – Choose exactly which sections to import
- **No immediate commitment** – Change workbook type or file at any time during preview

### User-Friendly
- **Drag-and-drop upload** – Click or drag files into the upload zone
- **Clear validation** – Immediate feedback on file type/size issues
- **Visual feedback** – Icons, colors, and progress indicators throughout
- **Detailed results** – See exactly what was parsed, inserted, updated, and skipped

### Admin-Ready
- **No developer tools needed** – Pure admin UI, no Postman required
- **Business language** – Clear entity names and familiar terminology
- **Error details** – Warnings and errors grouped by section
- **Next actions** – Prompts to view or manage imported data

## Backend Integration

The import workflow uses these existing backend endpoints:

```
POST /api/business-operations/imports/parse-only
  - Analyze workbook structure without importing
  - Returns detected sheets, entity counts, warnings, errors

POST /api/business-operations/imports/payroll-workbook
  - Upload and import payroll data
  - Supports staged imports by section

POST /api/business-operations/imports/business-workbook
  - Upload and import business data
  - Supports staged imports by section
```

All payroll/business workbook parsing, validation, and import logic is handled by the backend service layer.

## Component Architecture

Modular components for maintainability:

- `BusinessOperationsImportButton` – Entry point button
- `BusinessOperationsImportModal` – Main modal with step navigation
- `WorkbookTypeSelector` – Workbook type choice UI
- `WorkbookFileUploader` – File selection with drag-and-drop
- `WorkbookParsePreview` – Parse result visualization
- `WorkbookSectionSelector` – Section selection checkboxes
- `WorkbookImportResults` – Results display panel
- `ImportWarningsList` – Warnings display
- `ImportErrorsList` – Errors display

## State Management

Uses React hooks and axios for API calls, following the existing admin frontend pattern:

- No additional state library required
- Local component state for workflow steps
- axios for multipart/form-data upload and requests
- Automatic token injection via API client

## Next Enhancements (Optional)

Future phases could add:

1. **Download workbook templates** – Pre-formatted .xlsx files for user reference
2. **Import history** – Track previous imports and results
3. **Undo/revert imports** – Mark records as imported but allow rollback
4. **Batch import scheduling** – Schedule imports to run at specific times
5. **Direct tab navigation** – "View imported Employees" jumps to Employees tab
6. **Custom field mapping** – Let admins map custom column names to standard fields
7. **Conditional import rules** – Skip records based on criteria or status
8. **Email notifications** – Send import summary to admin email

## File Locations

Frontend components:
- [BusinessOperationsImportButton.jsx](citi-nati-frontend/src/components/admin/business-operations/BusinessOperationsImportButton.jsx)
- [BusinessOperationsImportModal.jsx](citi-nati-frontend/src/components/admin/business-operations/BusinessOperationsImportModal.jsx)
- [WorkbookTypeSelector.jsx](citi-nati-frontend/src/components/admin/business-operations/WorkbookTypeSelector.jsx)
- [WorkbookFileUploader.jsx](citi-nati-frontend/src/components/admin/business-operations/WorkbookFileUploader.jsx)
- [WorkbookParsePreview.jsx](citi-nati-frontend/src/components/admin/business-operations/WorkbookParsePreview.jsx)
- [WorkbookSectionSelector.jsx](citi-nati-frontend/src/components/admin/business-operations/WorkbookSectionSelector.jsx)
- [WorkbookImportResults.jsx](citi-nati-frontend/src/components/admin/business-operations/WorkbookImportResults.jsx)
- [ImportWarningsList.jsx](citi-nati-frontend/src/components/admin/business-operations/ImportWarningsList.jsx)

Backend endpoints:
- [imports.routes.js](citi-nati-backend/src/routes/business-operations/imports.routes.js)
- [imports.controller.js](citi-nati-backend/src/controllers/business-operations/imports.controller.js)
- Service layer: [workbookImport.service.js](citi-nati-backend/src/services/business-operations/workbookImport.service.js)

## Testing

To test the import workflow:

1. **Open Business Operations** in admin dashboard
2. **Click Import Workbook** button
3. **Select Payroll** workbook type
4. **Upload a test payroll .xlsx file**
5. **Click Preview Parse** to see detected structure
6. **Select sections** to import
7. **Click Import Now** to execute
8. **Review results** including parsed/inserted/updated counts

Expected results depend on your test data, but you should see:
- Recognized sheets listed
- Entity counts displayed
- Import operations summarized per section
- Success status and any warnings/errors clearly marked
