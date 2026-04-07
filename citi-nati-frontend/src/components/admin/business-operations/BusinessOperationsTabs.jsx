import React from 'react';

const BusinessOperationsTabs = ({ tabs, activeTab, onChange }) => {
  return (
    <div className="bo-tabs-strip">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          className={`bo-tab-button${activeTab === tab.id ? ' active' : ''}`}
        >
          <i className={`fas ${tab.icon} bo-tab-icon`}></i>
          {tab.label}
        </button>
      ))}
    </div>
  );
};

export default BusinessOperationsTabs;
