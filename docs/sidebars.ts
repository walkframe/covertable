import type {SidebarsConfig} from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  docsSidebar: [
    'index',
    {
      type: 'category',
      label: 'Online Tools',
      items: ['tools/pict-online'],
    },
    {
      type: 'category',
      label: 'Reference',
      link: { type: 'generated-index', slug: '/reference' },
      items: [
        'reference/options',
        'reference/pict',
        {
          type: 'category',
          label: 'Shortcuts',
          items: ['reference/shortcuts/constraint'],
        },
      ],
    },
    {
      type: 'category',
      label: 'Development',
      items: ['development/algorithm', 'development/constraint-logic', 'development/typescript', 'development/python'],
    },
    {
      type: 'category',
      label: 'History',
      items: ['history/index', 'history/v3', 'history/v2', 'history/v1', 'history/migration'],
    },
  ],
};

export default sidebars;
