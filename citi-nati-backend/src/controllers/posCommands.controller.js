const queueService = require('../services/posCommandQueue.service');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

function isAuthorizedAgent(req) {
  const provided = req.headers['x-pos-secret'];
  const expected = process.env.POS_SECRET;
  return !!provided && !!expected && provided === expected;
}

function getAgentId(req) {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  return req.headers['x-agent-id'] || body.agentId || 'unknown-agent';
}

async function pollCommands(req, res) {
  try {
    if (!isAuthorizedAgent(req)) {
      return res.status(403).json({ success: false, error: 'Unauthorized' });
    }

    const agentId = getAgentId(req);
    const limit = req.body && req.body.limit ? req.body.limit : 10;
    
    // Extract target location codes from request (agent specifies which locations it handles)
    let targetLocationCodes = [];
    if (req.body && Array.isArray(req.body.locationCodes)) {
      targetLocationCodes = req.body.locationCodes;
    } else if (req.body && typeof req.body.locationCode === 'string') {
      targetLocationCodes = [req.body.locationCode];
    }

    // Optional branchCode filter — allows agents that share a locationCode (e.g. both Blantyre
    // and Zomba use 'SH') to claim only their own branch's commands.
    let targetBranchCodes = [];
    if (req.body && Array.isArray(req.body.branchCodes)) {
      targetBranchCodes = req.body.branchCodes;
    } else if (req.body && typeof req.body.branchCode === 'string') {
      targetBranchCodes = [req.body.branchCode];
    }
    
    const claimed = await queueService.claimPendingCommands(limit, agentId, targetLocationCodes, targetBranchCodes);

    return res.json({
      success: true,
      commands: claimed.map((command) => ({
        id: command.id,
        commandType: command.commandType,
        payload: command.payload,
        createdAt: command.createdAt,
      })),
    });
  } catch (error) {
    console.error('[POS COMMAND QUEUE ERROR] poll failed:', error.message);
    return res.status(500).json({ success: false, error: 'Failed to poll commands' });
  }
}

async function completeCommand(req, res) {
  try {
    if (!isAuthorizedAgent(req)) {
      return res.status(403).json({ success: false, error: 'Unauthorized' });
    }

    const { id } = req.params;
    const { resultSummary } = req.body;
    const agentId = getAgentId(req);

    // Fetch command before marking complete (need commandType + relatedEntityId for side-effects)
    const command = await queueService.getCommandById(id);

    await queueService.markCommandCompleted(id, resultSummary || {}, agentId);

    // Side-effect: mark related GoodsIntake as 'transferred' when the agent reports success
    if (command && command.commandType === 'CREATE_PENDING_STOCK_INTAKE' && command.relatedEntityType === 'GoodsIntake' && command.relatedEntityId) {
      try {
        const intakeId = parseInt(command.relatedEntityId, 10);
        const finalGrn = resultSummary?.finalGrn || resultSummary?.grnNo || null;
        if (Number.isFinite(intakeId)) {
          await prisma.goodsIntake.update({
            where: { id: intakeId },
            data: {
              posTransferStatus: 'transferred',
              ...(finalGrn ? { posTransferGrn: String(finalGrn) } : {}),
            },
          });
          console.log(`[POS COMMAND QUEUE] GoodsIntake ${intakeId} marked as transferred after command ${id} completed`);
        }
      } catch (sideEffectError) {
        // Non-fatal — log but don't fail the command complete response
        console.error(`[POS COMMAND QUEUE] Failed to update GoodsIntake status after command ${id}:`, sideEffectError.message);
      }
    }

    // Side-effect: persist supplier branch-link when POS supplier sync command succeeds
    if (command && command.commandType === 'CREATE_OR_LINK_SUPPLIER' && command.relatedEntityType === 'Supplier' && command.relatedEntityId) {
      try {
        const supplierId = parseInt(command.relatedEntityId, 10);
        const payloadBranchCode = String((command.payload && command.payload.branchCode) || '').trim().toUpperCase();
        const posSupplierCode = Number(resultSummary && (resultSummary.posSupplierCode || resultSummary.supplierCode));
        const posSupplierName = String((resultSummary && (resultSummary.posSupplierName || resultSummary.supplierName)) || '').trim() || null;

        if (Number.isFinite(supplierId) && payloadBranchCode && Number.isFinite(posSupplierCode) && posSupplierCode > 0) {
          await prisma.$transaction(async (tx) => {
            const conflictingLink = await tx.supplierPosLink.findUnique({
              where: {
                branchCode_posSupplierCode: {
                  branchCode: payloadBranchCode,
                  posSupplierCode,
                },
              },
              select: { id: true, supplierId: true },
            });

            if (conflictingLink && conflictingLink.supplierId !== supplierId) {
              await tx.supplierPosLink.update({
                where: { id: conflictingLink.id },
                data: {
                  posSupplierCode: null,
                  syncStatus: 'failed',
                  syncedAt: null,
                  syncError: `POS supplier code ${posSupplierCode} reassigned to supplier ${supplierId}`,
                },
              });

              console.warn(
                `[POS COMMAND QUEUE] Reassigned POS supplier code ${posSupplierCode} in branch ${payloadBranchCode} from supplier ${conflictingLink.supplierId} to ${supplierId}`
              );
            }

            await tx.supplierPosLink.upsert({
              where: {
                supplierId_branchCode: {
                  supplierId,
                  branchCode: payloadBranchCode,
                },
              },
              create: {
                supplierId,
                branchCode: payloadBranchCode,
                posSupplierCode,
                posSupplierName,
                syncStatus: 'synced',
                syncedAt: new Date(),
                syncError: null,
              },
              update: {
                posSupplierCode,
                posSupplierName,
                syncStatus: 'synced',
                syncedAt: new Date(),
                syncError: null,
              },
            });
          });

          console.log(`[POS COMMAND QUEUE] Supplier ${supplierId} linked to POS branch ${payloadBranchCode} code ${posSupplierCode} after command ${id} completed`);
        }
      } catch (sideEffectError) {
        console.error(`[POS COMMAND QUEUE] Failed to update supplier POS link after command ${id}:`, sideEffectError.message);
      }
    }

    return res.json({ success: true, id, status: 'COMPLETED' });
  } catch (error) {
    console.error('[POS COMMAND QUEUE ERROR] complete failed:', error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
}

async function failCommand(req, res) {
  try {
    if (!isAuthorizedAgent(req)) {
      return res.status(403).json({ success: false, error: 'Unauthorized' });
    }

    const { id } = req.params;
    const { errorMessage, retryable } = req.body;
    const agentId = getAgentId(req);

    // Fetch command before marking failed (need commandType + relatedEntityId for side-effects)
    const command = await queueService.getCommandById(id);

    await queueService.markCommandFailed(
      id,
      errorMessage || 'Command failed without details',
      retryable !== false,
      agentId
    );

    // Side-effect: mark related GoodsIntake as 'failed' when retries exhausted (retryable=false)
    if (retryable === false && command && command.commandType === 'CREATE_PENDING_STOCK_INTAKE' && command.relatedEntityType === 'GoodsIntake' && command.relatedEntityId) {
      try {
        const intakeId = parseInt(command.relatedEntityId, 10);
        if (Number.isFinite(intakeId)) {
          await prisma.goodsIntake.update({
            where: { id: intakeId },
            data: { posTransferStatus: 'failed' },
          });
          console.log(`[POS COMMAND QUEUE] GoodsIntake ${intakeId} marked as failed after command ${id} non-retryable failure`);
        }
      } catch (sideEffectError) {
        console.error(`[POS COMMAND QUEUE] Failed to update GoodsIntake status after command ${id} failure:`, sideEffectError.message);
      }
    }

    // Side-effect: mark supplier branch-link sync as failed on non-retryable supplier sync command
    if (retryable === false && command && command.commandType === 'CREATE_OR_LINK_SUPPLIER' && command.relatedEntityType === 'Supplier' && command.relatedEntityId) {
      try {
        const supplierId = parseInt(command.relatedEntityId, 10);
        const payloadBranchCode = String((command.payload && command.payload.branchCode) || '').trim().toUpperCase();
        if (Number.isFinite(supplierId) && payloadBranchCode) {
          await prisma.supplierPosLink.upsert({
            where: {
              supplierId_branchCode: {
                supplierId,
                branchCode: payloadBranchCode,
              },
            },
            create: {
              supplierId,
              branchCode: payloadBranchCode,
              posSupplierCode: null,
              posSupplierName: String((command.payload && command.payload.supplierName) || '').trim() || null,
              syncStatus: 'failed',
              syncedAt: null,
              syncError: errorMessage || 'Supplier sync failed',
            },
            update: {
              syncStatus: 'failed',
              syncError: errorMessage || 'Supplier sync failed',
            },
          });

          console.log(`[POS COMMAND QUEUE] Supplier ${supplierId} marked failed for POS branch ${payloadBranchCode} after command ${id} non-retryable failure`);
        }
      } catch (sideEffectError) {
        console.error(`[POS COMMAND QUEUE] Failed to update supplier POS link failure status after command ${id}:`, sideEffectError.message);
      }
    }

    return res.json({ success: true, id });
  } catch (error) {
    console.error('[POS COMMAND QUEUE ERROR] fail failed:', error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
}

async function getCommand(req, res) {
  try {
    if (!isAuthorizedAgent(req)) {
      return res.status(403).json({ success: false, error: 'Unauthorized' });
    }

    const command = await queueService.getCommandById(req.params.id);

    if (!command) {
      return res.status(404).json({ success: false, error: 'Command not found' });
    }

    return res.json({ success: true, command });
  } catch (error) {
    console.error('[POS COMMAND QUEUE ERROR] get command failed:', error.message);
    return res.status(500).json({ success: false, error: 'Failed to fetch command' });
  }
}

async function listCommands(req, res) {
  try {
    if (!isAuthorizedAgent(req)) {
      return res.status(403).json({ success: false, error: 'Unauthorized' });
    }

    const commands = await queueService.listCommands({
      status: req.query.status,
      take: req.query.take,
      skip: req.query.skip,
    });

    return res.json({ success: true, commands });
  } catch (error) {
    console.error('[POS COMMAND QUEUE ERROR] list failed:', error.message);
    return res.status(500).json({ success: false, error: 'Failed to list commands' });
  }
}

async function getCommandStats(req, res) {
  try {
    if (!isAuthorizedAgent(req)) {
      return res.status(403).json({ success: false, error: 'Unauthorized' });
    }

    const stats = await queueService.getStats();
    return res.json({ success: true, stats });
  } catch (error) {
    console.error('[POS COMMAND QUEUE ERROR] stats failed:', error.message);
    return res.status(500).json({ success: false, error: 'Failed to fetch stats' });
  }
}

module.exports = {
  pollCommands,
  completeCommand,
  failCommand,
  getCommand,
  listCommands,
  getCommandStats,
};
