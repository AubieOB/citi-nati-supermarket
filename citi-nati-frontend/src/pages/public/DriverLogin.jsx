import React from 'react';
import RoleLoginForm from './RoleLoginForm.jsx';

const DriverLogin = () => (
  <RoleLoginForm roleLabel="Driver" allowedRoles={['driver']} redirectPath="/driver" />
);

export default DriverLogin;
