const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

/**
 * Get all users (ADMIN only)
 */
const getAllUsers = async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return res.status(200).json({
      message: 'Users retrieved successfully',
      users,
    });
  } catch (err) {
    console.error('Error fetching all users:', err);
    return res.status(500).json({ error: 'Server error while fetching users' });
  }
};

/**
 * Update user role (ADMIN only)
 * Only allows changing role, not other fields
 */
const updateUserRole = async (req, res) => {
  try {
    const { id } = req.params;
    const { role } = req.body;

    console.log('[DEBUG ROLE UPDATE] Received:', { id, role, body: req.body });

    // Validate role parameter
    if (!role) {
      return res.status(400).json({ error: 'Role is required' });
    }

    // Ensure role is one of allowed values
    const allowedRoles = ['user', 'admin', 'driver'];
    const normalizedRole = role.toLowerCase();
    console.log('[DEBUG ROLE UPDATE] Normalizing:', { received: role, normalized: normalizedRole, allowed: allowedRoles });
    
    if (!allowedRoles.includes(normalizedRole)) {
      return res.status(400).json({
        error: `Invalid role. Allowed values: ${allowedRoles.join(', ')}`,
      });
    }

    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { id },
    });

    if (!existingUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Update only the role
    const updatedUser = await prisma.user.update({
      where: { id },
      data: {
        role: normalizedRole,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // If role changed FROM "driver" to something else, delete the Driver record
    if (existingUser.role === 'driver' && normalizedRole !== 'driver') {
      await prisma.driver.deleteMany({
        where: {
          email: existingUser.email,
        },
      });
      console.log('[DEBUG ROLE UPDATE] Deleted Driver record for user:', existingUser.email);
    }

    // If role changed TO "driver", ensure a Driver record exists
    if (normalizedRole === 'driver') {
      const existingDriver = await prisma.driver.findFirst({
        where: {
          email: existingUser.email,
        },
      });

      if (!existingDriver) {
        // Create a Driver record for this user (phone is optional/null)
        await prisma.driver.create({
          data: {
            name: existingUser.name,
            phone: null, // Phone left empty for admin to fill in
            email: existingUser.email,
          },
        });
        console.log('[DEBUG ROLE UPDATE] Created Driver record for user:', existingUser.email);
      }
    }

    console.log('[DEBUG ROLE UPDATE] User role updated:', { userId: id, newRole: normalizedRole });

    return res.status(200).json({
      message: 'User role updated successfully',
      user: updatedUser,
    });
  } catch (err) {
    console.error('Error updating user role:', err);
    return res.status(500).json({ error: 'Server error while updating user role' });
  }
};

/**
 * Delete user (ADMIN only)
 * Cascading deletes handle user's cart and orders
 */
const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { id },
    });

    if (!existingUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    // If user is a driver, delete the Driver record first
    if (existingUser.role === 'driver') {
      await prisma.driver.deleteMany({
        where: { email: existingUser.email },
      });
      console.log('[DEBUG USER DELETE] Deleted associated Driver record for:', existingUser.email);
    }

    // Delete user (CASCADE will handle cart and orders)
    await prisma.user.delete({
      where: { id },
    });

    return res.status(200).json({
      message: 'User deleted successfully',
    });
  } catch (err) {
    console.error('Error deleting user:', err);
    return res.status(500).json({ error: 'Server error while deleting user' });
  }
};

module.exports = {
  getAllUsers,
  updateUserRole,
  deleteUser,
};
