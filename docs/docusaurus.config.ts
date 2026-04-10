import {themes as prismThemes} from 'prism-react-renderer';
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';
import path from 'path';

const config: Config = {
  title: 'covertable',
  tagline: 'A flexible pairwise testing tool for generating covering arrays',
  favicon: 'img/favicon.ico',

  future: {
    v4: true,
  },

  markdown: {
    mermaid: true,
  },
  themes: ['@docusaurus/theme-mermaid'],

  url: 'https://covertable.walkframe.com',
  baseUrl: '/',

  organizationName: 'walkframe',
  projectName: 'covertable',

  onBrokenLinks: 'throw',

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  plugins: [
    function covertablePlugin() {
      return {
        name: 'covertable-webpack-plugin',
        configureWebpack() {
          return {
            resolve: {
              alias: {
                'covertable/pict': path.resolve(__dirname, '../typescript/src/pict/index.ts'),
                covertable: path.resolve(__dirname, '../typescript/src/index.ts'),
              },
            },
          };
        },
      };
    },
  ],

  presets: [
    [
      'classic',
      {
        docs: {
          path: 'contents',
          sidebarPath: './sidebars.ts',
          routeBasePath: '/',
          editUrl:
            'https://github.com/walkframe/covertable/tree/master/docs/',
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    image: 'img/covertable-social-card.png',
    colorMode: {
      respectPrefersColorScheme: true,
    },
    navbar: {
      title: 'covertable',
      items: [
        {
          href: 'https://www.npmjs.com/package/covertable',
          label: 'npm',
          position: 'right',
        },
        {
          href: 'https://pypi.org/project/covertable/',
          label: 'PyPI',
          position: 'right',
        },
        {
          href: 'https://github.com/walkframe/covertable',
          label: 'GitHub',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Docs',
          items: [
            {
              label: 'Getting Started',
              to: '/',
            },
            {
              label: 'Advanced Usage',
              to: '/advanced',
            },
            {
              label: 'Compatible PICT',
              to: '/tools/pict',
            },
          ],
        },
        {
          title: 'Links',
          items: [
            {
              label: 'GitHub',
              href: 'https://github.com/walkframe/covertable',
            },
            {
              label: 'npm',
              href: 'https://www.npmjs.com/package/covertable',
            },
            {
              label: 'PyPI',
              href: 'https://pypi.org/project/covertable/',
            },
          ],
        },
      ],
      copyright: `Copyright &copy; ${new Date().getFullYear()} walkframe. Built with Docusaurus.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: ['bash', 'typescript', 'javascript'],
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
