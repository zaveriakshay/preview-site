import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import node from '@astrojs/node';

// This configuration uses a custom component for the sidebar,
// completely avoiding the problematic `sidebar` property.
export default defineConfig({
    output: 'server',
    adapter: node({
        mode: 'standalone'
    }),
    integrations: [
        starlight({
            title: 'noqodiDocs',
            locales: {
                en: { label: 'English', lang: 'en' },
                ar: { label: 'العربية', lang: 'ar', dir: 'rtl' },
            },
            // This correctly tells Starlight that the default language lives at the `/en/` path.
            defaultLocale: 'en',

            // Tell Starlight to use our custom components
            components: {
                // Override sidebar with version-aware sidebar
                Sidebar: './src/components/Sidebar.astro',
                
                // Use stub header to disable Starlight's default header
                // Our actual header is rendered via PageFrame component
                Header: './src/components/StarlightHeaderStub.astro',
                
                // Override PageFrame to include our custom header and footer
                PageFrame: './src/components/PageFrame.astro',
            },


            // The 'sidebar' property is INTENTIONALLY NOT USED here.
        }),
    ],
    // Add a redirect for a smoother user experience.
    redirects: {
        '/': '/en',
    },
});