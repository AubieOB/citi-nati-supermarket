import React from 'react';
import RoleLoginForm from './RoleLoginForm.jsx';

const AdminLogin = () => (
  <RoleLoginForm roleLabel="Admin" allowedRoles={['admin']} redirectPath="/admin" />
);

export default AdminLogin;
