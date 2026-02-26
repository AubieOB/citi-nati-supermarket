import React from 'react';
import { Link } from 'react-router-dom';
import Container from '../components/ui/Container.jsx';
import Button from '../components/ui/Button.jsx';
import '../styles/global.css';

const NotFound = () => {
  return (
    <div className="not-found">
      <Container>
        <div className="not-found__code">404</div>
        <h1 className="not-found__title">Page Not Found</h1>
        <p className="not-found__message">
          Sorry, the page you're looking for doesn't exist.
        </p>
        <Link to="/">
          <Button variant="primary" size="large">
            Return to Home
          </Button>
        </Link>
      </Container>
    </div>
  );
};

export default NotFound;
