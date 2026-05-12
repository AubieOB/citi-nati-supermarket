SELECT 
  gi.id,
  gi.intakeRef,
  gi.status,
  gi.finalizedAt,
  gi.createdAt,
  gi.locationCode,
  gi.locationId,
  gi.branchCode,
  COUNT(gii.id) as itemCount
FROM GoodsIntake gi
LEFT JOIN GoodsIntakeItem gii ON gi.id = gii.goodsIntakeId
WHERE DATE(gi.finalizedAt) = '2026-05-12' 
   OR (gi.finalizedAt IS NULL AND DATE(gi.createdAt) = '2026-05-12')
GROUP BY gi.id, gi.intakeRef, gi.status, gi.finalizedAt, gi.createdAt, gi.locationCode, gi.locationId, gi.branchCode
ORDER BY gi.finalizedAt DESC, gi.createdAt DESC
LIMIT 20;
