import React from 'react';
import RoleLoginForm from './RoleLoginForm.jsx';

const CashierLogin = () => (
  <RoleLoginForm roleLabel="Cashier" allowedRoles={['cashier']} redirectPath="/cashier" />
);

export default CashierLogin;
