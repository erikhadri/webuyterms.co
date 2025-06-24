/* tailwind.config.js */
module.exports = {
    content: [
        "./*.html",          // Root HTML files (index.html, sell.html, etc.)
        "./**/*.html",       // HTML files in subdirectories
        "./*.js",            // JavaScript files with Tailwind classes
        "./**/*.js"          // JavaScript files in subdirectories
    ],
    theme: {
        extend: {
            // Add mobile-specific customizations if needed
            screens: {
                'xs': '320px', // Extra-small screens (e.g., older mobiles)
            }
        }
    },
    plugins: [],
    purge: {
        enabled: process.env.NODE_ENV === 'production', // Purge in production (Render)
        content: [
            "./*.html",
            "./**/*.html",
            "./*.js",
            "./**/*.js"
        ]
    }
};