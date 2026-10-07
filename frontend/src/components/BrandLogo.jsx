import React from 'react';

/**
 * Exact ATT PER Y brand logo as shown in reference video:
 * Dark forest green squircle with ivory serif typography 'ATT' and 'PERY',
 * and the signature gold wave ribbon passing between them.
 */
export default function BrandLogo({ size = 40, className = '', style = {} }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={`brand-logo-svg ${className}`}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{
        display: 'inline-block',
        verticalAlign: 'middle',
        borderRadius: '22%',
        flexShrink: 0,
        boxShadow: '0 2px 8px rgba(22, 59, 43, 0.2)',
        ...style
      }}
    >
      <rect width="100" height="100" rx="22" fill="#163b2b" />
      <rect width="100" height="100" rx="22" fill="url(#brand-logo-shine)" opacity="0.35" />
      
      {/* Signature curved gold filament wave */}
      <path
        d="M 18 51 C 32 51 40 46 51 46 C 63 46 72 56 84 54"
        stroke="#c5a059"
        strokeWidth="2.4"
        strokeLinecap="round"
        opacity="0.9"
      />

      {/* Top line: ATT */}
      <text
        x="50"
        y="42"
        textAnchor="middle"
        fontFamily="'Fraunces', Georgia, 'Times New Roman', serif"
        fontSize="24"
        fontWeight="700"
        fill="#f8f7f2"
        letterSpacing="2.5"
      >
        ATT
      </text>

      {/* Bottom line: PERY */}
      <text
        x="50"
        y="72"
        textAnchor="middle"
        fontFamily="'Fraunces', Georgia, 'Times New Roman', serif"
        fontSize="20.5"
        fontWeight="700"
        fill="#f8f7f2"
        letterSpacing="2"
      >
        PERY
      </text>

      <defs>
        <linearGradient id="brand-logo-shine" x1="0" y1="0" x2="100" y2="100" gradientUnits="userSpaceOnUse">
          <stop stopColor="#2d6a4f" />
          <stop offset="1" stopColor="#0d2419" />
        </linearGradient>
      </defs>
    </svg>
  );
}
