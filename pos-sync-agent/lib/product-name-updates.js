const sql = require('mssql');

function createQueryRequest(request) {
  return request && request.transaction
    ? new sql.Request(request.transaction)
    : request && request.parent
      ? new sql.Request(request.parent)
      : request;
}

async function productExists(request, productCode) {
  const lookupRequest = createQueryRequest(request);
  const result = await lookupRequest
    .input('LookupProductCode', sql.VarChar(50), productCode)
    .query(`
      SELECT TOP 1 ProductCode
      FROM (
        SELECT ProductCode FROM POS.dbo.products WHERE ProductCode = @LookupProductCode
        UNION ALL
        SELECT ProductCode FROM POS.dbo.productsmaster WHERE ProductCode = @LookupProductCode
      ) AS product_lookup
    `);

  return Boolean(result.recordset && result.recordset[0]);
}

async function getCurrentNames(request, productCode) {
  const namesRequest = createQueryRequest(request);
  const result = await namesRequest
    .input('NamesProductCode', sql.VarChar(50), productCode)
    .query(`
      SELECT
        MAX(CASE WHEN source_name = 'products' THEN ProductName END) AS productsName,
        MAX(CASE WHEN source_name = 'productsmaster' THEN ProductName END) AS productsMasterName
      FROM (
        SELECT 'products' AS source_name, ProductName
        FROM POS.dbo.products
        WHERE ProductCode = @NamesProductCode

        UNION ALL

        SELECT 'productsmaster' AS source_name, ProductName
        FROM POS.dbo.productsmaster
        WHERE ProductCode = @NamesProductCode
      ) AS names
    `);

  const row = result.recordset?.[0] || {};
  return {
    productsName: row.productsName || null,
    productsMasterName: row.productsMasterName || null,
  };
}

async function updateProductName(request, payload = {}) {
  const productCode = String(payload.productCode || '').trim();
  const newName = String(payload.newName || '').trim();
  const oldName = payload.oldName == null ? null : String(payload.oldName).trim();

  if (!productCode) {
    throw new Error('NON_RETRYABLE: UPDATE_PRODUCT_NAME payload missing productCode');
  }

  if (!newName) {
    throw new Error('NON_RETRYABLE: UPDATE_PRODUCT_NAME payload missing newName');
  }

  if (newName.length > 120) {
    throw new Error('NON_RETRYABLE: UPDATE_PRODUCT_NAME newName exceeds max length 120');
  }

  const exists = await productExists(request, productCode);
  if (!exists) {
    throw new Error(`NON_RETRYABLE: Product ${productCode} does not exist in POS`);
  }

  const before = await getCurrentNames(request, productCode);

  const productsUpdateRequest = createQueryRequest(request);
  const productsResult = await productsUpdateRequest
    .input('ProductsProductCode', sql.VarChar(50), productCode)
    .input('ProductsNewName', sql.VarChar(120), newName)
    .query(`
      UPDATE POS.dbo.products
      SET ProductName = @ProductsNewName
      WHERE ProductCode = @ProductsProductCode;

      SELECT @@ROWCOUNT AS affectedRows;
    `);

  const productsAffected = Number(productsResult.recordset?.[0]?.affectedRows || 0);

  const masterUpdateRequest = createQueryRequest(request);
  const masterResult = await masterUpdateRequest
    .input('MasterProductCode', sql.VarChar(50), productCode)
    .input('MasterNewName', sql.VarChar(120), newName)
    .query(`
      UPDATE POS.dbo.productsmaster
      SET ProductName = @MasterNewName
      WHERE ProductCode = @MasterProductCode;

      SELECT @@ROWCOUNT AS affectedRows;
    `);

  const productsMasterAffected = Number(masterResult.recordset?.[0]?.affectedRows || 0);

  if (productsAffected <= 0 && productsMasterAffected <= 0) {
    throw new Error(`NON_RETRYABLE: No POS product rows were updated for ${productCode}`);
  }

  return {
    message: 'Product name updated in POS',
    productCode,
    oldName,
    newName,
    before,
    after: {
      productsName: productsAffected > 0 ? newName : before.productsName,
      productsMasterName: productsMasterAffected > 0 ? newName : before.productsMasterName,
    },
    affectedRows: {
      products: productsAffected,
      productsmaster: productsMasterAffected,
    },
  };
}

module.exports = {
  updateProductName,
};
