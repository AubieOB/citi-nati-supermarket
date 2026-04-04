'use strict';

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

function parseDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

async function createEmployee(payload) {
  return prisma.employee.create({
    data: {
      employeeNo: payload.employeeNo || null,
      firstName: payload.firstName,
      surname: payload.surname,
      middleName: payload.middleName || null,
      gender: payload.gender || null,
      dateOfBirth: payload.dateOfBirth || null,
      districtOfOrigin: payload.districtOfOrigin || null,
      village: payload.village || null,
      traditionalAuthority: payload.traditionalAuthority || null,
      nationalId: payload.nationalId || null,
      nationalIdExpiryDate: payload.nationalIdExpiryDate || null,
      contactNumber: payload.contactNumber || null,
      dateOfEmployment: payload.dateOfEmployment || null,
      position: payload.position || null,
      department: payload.department || null,
      locationId: payload.locationId || null,
      employmentType: payload.employmentType || null,
      status: payload.status || 'active',
      notes: payload.notes || null,
    },
  });
}

async function updateEmployee(id, payload) {
  return prisma.employee.update({
    where: { id },
    data: {
      employeeNo: payload.employeeNo,
      firstName: payload.firstName,
      surname: payload.surname,
      middleName: payload.middleName,
      gender: payload.gender,
      dateOfBirth: payload.dateOfBirth,
      districtOfOrigin: payload.districtOfOrigin,
      village: payload.village,
      traditionalAuthority: payload.traditionalAuthority,
      nationalId: payload.nationalId,
      nationalIdExpiryDate: payload.nationalIdExpiryDate,
      contactNumber: payload.contactNumber,
      dateOfEmployment: payload.dateOfEmployment,
      position: payload.position,
      department: payload.department,
      locationId: payload.locationId,
      employmentType: payload.employmentType,
      status: payload.status,
      notes: payload.notes,
    },
  });
}

async function getEmployeeById(id) {
  return prisma.employee.findUnique({
    where: { id },
    include: {
      salaryStructures: {
        orderBy: { effectiveFrom: 'desc' },
        take: 1,
      },
    },
  });
}

async function listEmployees({ search, status, department, locationId, skip, take, sortBy, sortOrder }) {
  const where = {};

  if (status) where.status = status;
  if (department) where.department = department;
  if (locationId) where.locationId = locationId;

  if (search) {
    where.OR = [
      { employeeNo: { contains: search, mode: 'insensitive' } },
      { firstName: { contains: search, mode: 'insensitive' } },
      { surname: { contains: search, mode: 'insensitive' } },
      { contactNumber: { contains: search, mode: 'insensitive' } },
      { nationalId: { contains: search, mode: 'insensitive' } },
    ];
  }

  const [data, total] = await Promise.all([
    prisma.employee.findMany({
      where,
      include: {
        salaryStructures: {
          orderBy: { effectiveFrom: 'desc' },
          take: 1,
        },
      },
      skip,
      take,
      orderBy: { [sortBy]: sortOrder },
    }),
    prisma.employee.count({ where }),
  ]);

  return { data, total, where };
}

async function createSalaryStructure(payload) {
  if (payload.isCurrent) {
    await prisma.employeeSalaryStructure.updateMany({
      where: { employeeId: payload.employeeId, isCurrent: true },
      data: { isCurrent: false, effectiveTo: payload.effectiveFrom },
    });
  }

  return prisma.employeeSalaryStructure.create({
    data: {
      employeeId: payload.employeeId,
      agreedSalaryPerMonth: payload.agreedSalaryPerMonth,
      annualIncrementAmount: payload.annualIncrementAmount || 0,
      salaryAfterIncrement: payload.salaryAfterIncrement || null,
      currency: payload.currency || 'MWK',
      effectiveFrom: payload.effectiveFrom,
      effectiveTo: payload.effectiveTo || null,
      isCurrent: payload.isCurrent !== undefined ? payload.isCurrent : true,
    },
  });
}

async function updateSalaryStructure(id, payload) {
  const existing = await prisma.employeeSalaryStructure.findUnique({ where: { id } });

  if (payload.isCurrent === true) {
    await prisma.employeeSalaryStructure.updateMany({
      where: {
        employeeId: existing.employeeId,
        id: { not: id },
      },
      data: { isCurrent: false },
    });
  }

  return prisma.employeeSalaryStructure.update({
    where: { id },
    data: {
      agreedSalaryPerMonth: payload.agreedSalaryPerMonth,
      annualIncrementAmount: payload.annualIncrementAmount,
      salaryAfterIncrement: payload.salaryAfterIncrement,
      currency: payload.currency,
      effectiveFrom: payload.effectiveFrom,
      effectiveTo: payload.effectiveTo,
      isCurrent: payload.isCurrent,
    },
  });
}

async function getEmployeeSalaryHistory(employeeId) {
  return prisma.employeeSalaryStructure.findMany({
    where: { employeeId },
    orderBy: { effectiveFrom: 'desc' },
  });
}

async function getCurrentSalary(employeeId) {
  return prisma.employeeSalaryStructure.findFirst({
    where: { employeeId, isCurrent: true },
    orderBy: { effectiveFrom: 'desc' },
  });
}

async function bulkUpsertEmployees(records = []) {
  const result = { inserted: 0, updated: 0, skipped: 0 };

  for (const row of records) {
    const firstName = row.firstName ? String(row.firstName).trim() : '';
    const surname = row.surname ? String(row.surname).trim() : '';
    const employeeNo = row.employeeNo ? String(row.employeeNo).trim() : null;

    if (!firstName || !surname) {
      result.skipped += 1;
      continue;
    }

    let existing = null;

    if (employeeNo) {
      existing = await prisma.employee.findUnique({ where: { employeeNo } });
    }

    if (!existing) {
      existing = await prisma.employee.findFirst({
        where: {
          firstName: { equals: firstName, mode: 'insensitive' },
          surname: { equals: surname, mode: 'insensitive' },
          contactNumber: row.contactNumber || undefined,
        },
      });
    }

    const data = {
      employeeNo,
      firstName,
      surname,
      middleName: row.middleName || null,
      gender: row.gender || null,
      dateOfBirth: parseDate(row.dateOfBirth),
      districtOfOrigin: row.districtOfOrigin || null,
      village: row.village || null,
      traditionalAuthority: row.traditionalAuthority || null,
      nationalId: row.nationalId || null,
      nationalIdExpiryDate: parseDate(row.nationalIdExpiryDate),
      contactNumber: row.contactNumber || null,
      dateOfEmployment: parseDate(row.dateOfEmployment),
      position: row.position || null,
      department: row.department || null,
      locationId: row.locationId || null,
      employmentType: row.employmentType || null,
      status: row.status || 'active',
      notes: row.notes || null,
    };

    if (existing) {
      await prisma.employee.update({ where: { id: existing.id }, data });
      result.updated += 1;
    } else {
      await prisma.employee.create({ data });
      result.inserted += 1;
    }
  }

  return result;
}

async function bulkUpsertSalaryStructures(records = []) {
  const result = { inserted: 0, updated: 0, skipped: 0 };

  for (const row of records) {
    const employeeNo = row.employeeNo ? String(row.employeeNo).trim() : null;
    if (!employeeNo) {
      result.skipped += 1;
      continue;
    }

    const employee = await prisma.employee.findUnique({ where: { employeeNo } });
    if (!employee) {
      result.skipped += 1;
      continue;
    }

    const effectiveFrom = parseDate(row.effectiveFrom);
    if (!effectiveFrom) {
      result.skipped += 1;
      continue;
    }

    const agreedSalaryPerMonth = Number(row.agreedSalaryPerMonth);
    if (!Number.isFinite(agreedSalaryPerMonth)) {
      result.skipped += 1;
      continue;
    }

    const existing = await prisma.employeeSalaryStructure.findFirst({
      where: {
        employeeId: employee.id,
        effectiveFrom,
      },
    });

    const data = {
      employeeId: employee.id,
      agreedSalaryPerMonth,
      annualIncrementAmount: Number(row.annualIncrementAmount || 0),
      salaryAfterIncrement: row.salaryAfterIncrement !== undefined ? Number(row.salaryAfterIncrement) : null,
      currency: row.currency || 'MWK',
      effectiveFrom,
      effectiveTo: parseDate(row.effectiveTo),
      isCurrent: row.isCurrent !== undefined ? !!row.isCurrent : true,
    };

    if (data.isCurrent) {
      await prisma.employeeSalaryStructure.updateMany({
        where: {
          employeeId: employee.id,
          ...(existing ? { id: { not: existing.id } } : {}),
        },
        data: { isCurrent: false },
      });
    }

    if (existing) {
      await prisma.employeeSalaryStructure.update({ where: { id: existing.id }, data });
      result.updated += 1;
    } else {
      await prisma.employeeSalaryStructure.create({ data });
      result.inserted += 1;
    }
  }

  return result;
}

async function deleteEmployee(id) {
  return prisma.employee.delete({ where: { id } });
}

module.exports = {
  createEmployee,
  updateEmployee,
  getEmployeeById,
  listEmployees,
  deleteEmployee,
  createSalaryStructure,
  updateSalaryStructure,
  getEmployeeSalaryHistory,
  getCurrentSalary,
  bulkUpsertEmployees,
  bulkUpsertSalaryStructures,
};
