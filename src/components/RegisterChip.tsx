import React from 'react';
import { REGISTER_CSS_VAR, REGISTER_LABEL, type RegisterId } from '../registers';

export default function RegisterChip(props: { register: RegisterId }) {
  const { register } = props;
  return (
    <span
      className="chip"
      title={REGISTER_LABEL[register]}
      style={{ borderColor: REGISTER_CSS_VAR[register], color: REGISTER_CSS_VAR[register] }}
    >
      {REGISTER_LABEL[register].toUpperCase()}
    </span>
  );
}
