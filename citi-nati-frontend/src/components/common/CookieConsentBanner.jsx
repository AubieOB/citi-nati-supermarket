import React, { useEffect, useMemo, useState } from 'react';
import api from '../../utils/api.js';

const CONSENT_KEY = 'cookie_consent_preferences_v1';

const getInitialConsent = () => {
  try {
    const stored = localStorage.getItem(CONSENT_KEY);
    if (!stored) {
      return null;
    }

    const parsed = JSON.parse(stored);
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
};

const saveConsent = (consent) => {
  localStorage.setItem(CONSENT_KEY, JSON.stringify({
    ...consent,
    consentedAt: new Date().toISOString(),
  }));
};

const CookieConsentBanner = () => {
  const initialConsent = useMemo(() => getInitialConsent(), []);
  const [visible, setVisible] = useState(false);
  const [showPreferences, setShowPreferences] = useState(false);
  const [analytics, setAnalytics] = useState(Boolean(initialConsent?.analytics));
  const [marketing, setMarketing] = useState(Boolean(initialConsent?.marketing));
  const [maintenanceChecked, setMaintenanceChecked] = useState(false);
  const [maintenanceEnabled, setMaintenanceEnabled] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const fetchMaintenanceStatus = async () => {
      try {
        const response = await api.get('/system/status');
        if (!isMounted) {
          return;
        }

        setMaintenanceEnabled(Boolean(response?.data?.maintenanceMode));
      } catch {
        if (!isMounted) {
          return;
        }

        setMaintenanceEnabled(false);
      } finally {
        if (isMounted) {
          setMaintenanceChecked(true);
        }
      }
    };

    fetchMaintenanceStatus();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!maintenanceChecked) {
      setVisible(false);
      return undefined;
    }

    if (initialConsent || maintenanceEnabled) {
      setVisible(false);
      return undefined;
    }

    const timer = setTimeout(() => {
      setVisible(true);
    }, 2500);

    return () => clearTimeout(timer);
  }, [initialConsent, maintenanceChecked, maintenanceEnabled]);

  if (!visible) {
    return null;
  }

  const handleAcceptAll = () => {
    saveConsent({ necessary: true, analytics: true, marketing: true });
    setVisible(false);
  };

  const handleRejectOptional = () => {
    saveConsent({ necessary: true, analytics: false, marketing: false });
    setVisible(false);
  };

  const handleSavePreferences = () => {
    saveConsent({ necessary: true, analytics, marketing });
    setVisible(false);
    setShowPreferences(false);
  };

  return (
    <div className="cookie-banner" role="dialog" aria-live="polite" aria-label="Cookie consent">
      <div className="cookie-banner__content">
        <h3 className="cookie-banner__title">We use cookies</h3>
        <p className="cookie-banner__text">
          We use essential cookies to keep the site secure and working. With your permission, we also use analytics and marketing cookies to improve your experience.
        </p>

        {showPreferences && (
          <div className="cookie-banner__preferences">
            <label className="cookie-banner__option">
              <input type="checkbox" checked disabled />
              <span>Necessary cookies (always on)</span>
            </label>
            <label className="cookie-banner__option">
              <input
                type="checkbox"
                checked={analytics}
                onChange={(event) => setAnalytics(event.target.checked)}
              />
              <span>Analytics cookies</span>
            </label>
            <label className="cookie-banner__option">
              <input
                type="checkbox"
                checked={marketing}
                onChange={(event) => setMarketing(event.target.checked)}
              />
              <span>Marketing cookies</span>
            </label>
          </div>
        )}

        <div className="cookie-banner__actions">
          {!showPreferences && (
            <button className="cookie-banner__btn cookie-banner__btn--secondary" type="button" onClick={() => setShowPreferences(true)}>
              Preferences
            </button>
          )}
          {showPreferences && (
            <button className="cookie-banner__btn cookie-banner__btn--secondary" type="button" onClick={handleSavePreferences}>
              Save Preferences
            </button>
          )}
          <button className="cookie-banner__btn cookie-banner__btn--ghost" type="button" onClick={handleRejectOptional}>
            Reject [Optional]
          </button>
          <button className="cookie-banner__btn cookie-banner__btn--primary" type="button" onClick={handleAcceptAll}>
            Accept All
          </button>
        </div>
      </div>
    </div>
  );
};

export default CookieConsentBanner;