import forms from "@tailwindcss/forms";
import typography from "@tailwindcss/typography";

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx,js,jsx}"],
  theme: {
    extend: {
      fontFamily: { sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'] },
      colors: {
        risk: {
          low:    '#059669',  // emerald-600
          medium: '#ca8a04',  // yellow-600
          high:   '#dc2626',  // red-600
        },
      },
      backgroundImage: {
        'sos-grad': 'linear-gradient(to bottom, #ef4444, #dc2626)',
        'header-grad': 'linear-gradient(90deg, #111827, #1f2937)',
      },
      borderRadius: { '2xl': '1.25rem' },
    },
  },
  plugins: [forms, typography],
}
