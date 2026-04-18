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
      label: 'Advanced',
      items: ['advanced/index', 'advanced/options', 'advanced/pict', 'advanced/constraint-logic', 'advanced/shortcuts'],
    },
    {
      type: 'category',
      label: 'Development',
      items: ['development/typescript', 'development/python'],
    },
    {
      type: 'category',
      label: 'History',
      items: ['history/index', 'history/v3', 'history/v2', 'history/v1', 'history/migration'],
    },
  ],
};

export default sidebars;
