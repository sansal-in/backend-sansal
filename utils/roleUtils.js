const normalizeRoles = (value) => {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (!value) return [];
  return [value];
};

const hasRole = (user, role) => {
  if (!user) return false;
  return normalizeRoles(user.role).includes(role);
};

const addRoles = (value, rolesToAdd = []) => {
  const next = new Set(normalizeRoles(value));
  rolesToAdd.forEach((role) => {
    if (role) next.add(role);
  });
  return Array.from(next);
};

module.exports = { normalizeRoles, hasRole, addRoles };
