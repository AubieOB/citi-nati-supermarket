import React from 'react';

const Button = ({
  children,
  variant = 'primary',
  size = 'medium',
  disabled = false,
  onClick,
  type = 'button',
  className = '',
  ...props
}) => {
  // Map variant to CSS class
  const variantClass = {
    primary: 'btn--primary',
    secondary: 'btn--secondary',
    outline: 'btn--outline',
  }[variant] || 'btn--primary';

  // Map size to CSS class
  const sizeClass = {
    small: 'btn--small',
    medium: '',
    large: 'btn--large',
  }[size] || '';

  const buttonClass = `btn ${variantClass} ${sizeClass} ${className}`.trim();

  return (
    <button
      type={type}
      className={buttonClass}
      disabled={disabled}
      onClick={onClick}
      {...props}
    >
      {children}
    </button>
  );
};

export default Button;
