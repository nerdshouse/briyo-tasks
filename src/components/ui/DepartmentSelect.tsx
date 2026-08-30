/*
 * Developed by Nerdshouse Technologies LLP — https://nerdshouse.com
 * © 2026 WhiteRock (Royal Enterprise). All rights reserved.
 *
 * Unauthorized copying, modification, or distribution is strictly prohibited.
 */
import React, { useState } from 'react';
import { Select } from './Select';
import { Input } from './Input';

export const DEPARTMENTS = ['Marketing', 'Tech', 'Accounts', 'Operations', 'CRM'] as const;

const OTHER = '__other__';

interface DepartmentSelectProps {
  label?: string;
  value: string;
  onChange: (value: string) => void;
}

/**
 * Department picker: the five standard departments plus "Other", which reveals
 * a free-text input whose value is stored as the department.
 */
export const DepartmentSelect: React.FC<DepartmentSelectProps> = ({
  label = 'Department',
  value,
  onChange,
}) => {
  const [otherMode, setOtherMode] = useState(
    () => value !== '' && !DEPARTMENTS.includes(value as (typeof DEPARTMENTS)[number])
  );

  const selectValue = otherMode ? OTHER : value;

  return (
    <div className="space-y-2">
      <Select
        label={label}
        value={selectValue}
        onChange={(e) => {
          const v = e.target.value;
          if (v === OTHER) {
            setOtherMode(true);
            onChange('');
          } else {
            setOtherMode(false);
            onChange(v);
          }
        }}
      >
        <option value="">Select department</option>
        {DEPARTMENTS.map((d) => (
          <option key={d} value={d}>
            {d}
          </option>
        ))}
        <option value={OTHER}>Other</option>
      </Select>
      {otherMode && (
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Enter department name"
          aria-label="Other department name"
        />
      )}
    </div>
  );
};
