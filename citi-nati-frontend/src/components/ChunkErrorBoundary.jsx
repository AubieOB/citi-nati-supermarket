import React from 'react';

/**
 * Error Boundary for handling lazy-loaded chunk failures
 * Catches errors when dynamic imports fail to load (e.g., network issues, missing chunks)
 */
class ChunkErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { 
      hasError: false, 
      error: null,
      retryCount: 0 
    };
  }

  static getDerivedStateFromError(error) {
    console.error('[CHUNK ERROR]', error);
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[CHUNK ERROR BOUNDARY] Error caught:', {
      error: error.toString(),
      errorInfo,
      timestamp: new Date().toISOString()
    });
  }

  handleRetry = () => {
    console.log('[CHUNK ERROR BOUNDARY] Retrying chunk load...');
    this.setState(prevState => ({
      hasError: false,
      error: null,
      retryCount: prevState.retryCount + 1
    }));
    
    // Hard refresh after short delay to ensure clean state
    setTimeout(() => {
      window.location.reload();
    }, 500);
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          backgroundColor: '#f8f9fa',
          padding: '2rem',
          textAlign: 'center'
        }}>
          <div style={{
            backgroundColor: 'white',
            padding: '2rem',
            borderRadius: '8px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
            maxWidth: '500px'
          }}>
            <i className="fas fa-exclamation-triangle" style={{
              fontSize: '3rem',
              color: '#dc3545',
              marginBottom: '1rem'
            }}></i>
            
            <h1 style={{
              fontSize: '1.5rem',
              color: '#333',
              marginBottom: '0.5rem'
            }}>
              Page Loading Error
            </h1>
            
            <p style={{
              color: '#666',
              marginBottom: '1.5rem',
              lineHeight: '1.6'
            }}>
              We encountered an issue loading this page. This might be a temporary network issue.
            </p>

            {this.state.retryCount > 0 && (
              <p style={{
                color: '#999',
                fontSize: '0.85rem',
                marginBottom: '1rem'
              }}>
                Retry attempt: {this.state.retryCount}
              </p>
            )}

            <button
              onClick={this.handleRetry}
              style={{
                padding: '0.75rem 2rem',
                backgroundColor: '#5B4B8A',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                fontSize: '1rem',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'all 0.3s ease'
              }}
              onMouseEnter={(e) => {
                e.target.style.backgroundColor = '#4A3A7A';
                e.target.style.transform = 'translateY(-2px)';
              }}
              onMouseLeave={(e) => {
                e.target.style.backgroundColor = '#5B4B8A';
                e.target.style.transform = 'translateY(0)';
              }}
            >
              <i className="fas fa-redo" style={{ marginRight: '0.5rem' }}></i>
              Try Again
            </button>

            <p style={{
              color: '#999',
              fontSize: '0.75rem',
              marginTop: '1.5rem'
            }}>
              Or <a href="/" style={{ color: '#5B4B8A', textDecoration: 'none' }}>return to home</a>
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ChunkErrorBoundary;
