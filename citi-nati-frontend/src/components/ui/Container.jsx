import React from 'react';

const Container = ({ children, className = '' }) => {
  return (
    <div className={`container ${className}`.trim()}>
      {children}
    </div>
  );
};

export default Container;
