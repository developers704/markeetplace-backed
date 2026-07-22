const mongoose = require('mongoose');
const Policy = require('../models/policy.model');
const PolicyAcceptance = require('../models/policyAcceptance.model');
const Customer = require('../models/customer.model');

function normObjectId(value) {
  if (value == null || value === '' || value === 'undefined') return null;
  const id = typeof value === 'object' && value._id != null ? String(value._id) : String(value);
  return mongoose.isValidObjectId(id) ? id : null;
}

function buildApplicablePolicyFilter(roleId, warehouseId) {
  const role = normObjectId(roleId);
  const warehouse = normObjectId(warehouseId);

  if (!role && !warehouse) return null;

  const filter = { isActive: true };
  if (role && warehouse) {
    filter.applicableRoles = role;
    filter.applicableWarehouses = warehouse;
  } else if (role) {
    filter.applicableRoles = role;
  } else {
    filter.applicableWarehouses = warehouse;
  }
  return filter;
}

async function resolveRoleAndWarehouse({ customerId, roleId, warehouseId }) {
  let role = normObjectId(roleId);
  let warehouse = normObjectId(warehouseId);

  if ((!role || !warehouse) && customerId) {
    const customer = await Customer.findById(customerId).select('role warehouse').lean();
    if (customer) {
      if (!role) role = normObjectId(customer.role);
      if (!warehouse) {
        const wh = customer.warehouse;
        if (Array.isArray(wh) && wh.length) warehouse = normObjectId(wh[0]);
        else warehouse = normObjectId(wh);
      }
    }
  }

  return { roleId: role, warehouseId: warehouse };
}

/**
 * Same applicability rules as GET /api/policy/user/:customerId
 */
async function getUserApplicablePolicies({ customerId, roleId, warehouseId }) {
  const resolved = await resolveRoleAndWarehouse({ customerId, roleId, warehouseId });
  const filter = buildApplicablePolicyFilter(resolved.roleId, resolved.warehouseId);

  if (!filter) {
    return {
      roleId: resolved.roleId,
      warehouseId: resolved.warehouseId,
      allPolicies: [],
      signedPolicies: [],
      unsignedPolicies: [],
      statistics: {
        totalPolicies: 0,
        signedCount: 0,
        unsignedCount: 0,
        completionPercentage: 0,
      },
    };
  }

  const policies = await Policy.find(filter)
    .select('title policyType content version picture sequence showFirst createdAt updatedAt')
    .sort({ showFirst: -1, sequence: 1, createdAt: -1 })
    .lean();

  const acceptances = customerId
    ? await PolicyAcceptance.find({
        customer: customerId,
        policy: { $ne: null },
      })
        .select('policy acceptedAt signedDocumentPath policyVersion')
        .lean()
    : [];

  const acceptanceMap = new Map();
  acceptances.forEach((acceptance) => {
    const policyRef = acceptance.policy;
    const policyKey =
      policyRef && typeof policyRef === 'object'
        ? policyRef._id?.toString()
        : policyRef?.toString();
    if (policyKey) acceptanceMap.set(policyKey, acceptance);
  });

  const allPolicies = policies.map((policy) => {
    const acceptance = acceptanceMap.get(policy._id.toString());
    return {
      _id: policy._id,
      title: policy.title,
      policyType: policy.policyType,
      content: policy.content,
      version: policy.version,
      picture: policy.picture,
      sequence: policy.sequence,
      createdAt: policy.createdAt,
      updatedAt: policy.updatedAt,
      isSigned: !!acceptance,
      signedAt: acceptance?.acceptedAt ?? null,
      signedDocumentPath: acceptance?.signedDocumentPath
        ? `uploads/${acceptance.signedDocumentPath}`
        : null,
      policyVersion:
        acceptance?.policyVersion ??
        (policy.version != null ? String(policy.version) : null),
    };
  });

  const signedPolicies = allPolicies.filter((p) => p.isSigned);
  const unsignedPolicies = allPolicies.filter((p) => !p.isSigned);

  return {
    roleId: resolved.roleId,
    warehouseId: resolved.warehouseId,
    allPolicies,
    signedPolicies,
    unsignedPolicies,
    statistics: {
      totalPolicies: allPolicies.length,
      signedCount: signedPolicies.length,
      unsignedCount: unsignedPolicies.length,
      completionPercentage:
        allPolicies.length > 0
          ? Math.round((signedPolicies.length / allPolicies.length) * 100)
          : 0,
    },
  };
}

function policyContentSummary(content, maxLen = 400) {
  return String(content || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
}

module.exports = {
  buildApplicablePolicyFilter,
  resolveRoleAndWarehouse,
  getUserApplicablePolicies,
  policyContentSummary,
};
