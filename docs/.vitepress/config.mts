import { defineConfig } from 'vitepress';

export default defineConfig({
  title: 'JetPack',
  description:
    'Local Compute & Native App Orchestrator — Native GPU speed inside OS-level kernel sandboxes without VMs.',
  lang: 'en-US',
  cleanUrls: true,
  lastUpdated: true,
  ignoreDeadLinks: false,
  srcExclude: ['**/README.md'],
  appearance: true,

  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/logo.svg' }],
    ['meta', { name: 'theme-color', content: '#6366f1' }],
  ],

  markdown: {
    theme: {
      light: 'github-light',
      dark: 'github-dark',
    },
    lineNumbers: false,
  },

  themeConfig: {
    siteTitle: 'JetPack',
    logo: '/logo.svg',

    search: {
      provider: 'local',
      options: {
        detailedView: true,
      },
    },

    nav: [
      { text: 'Guide', link: '/guide/introduction', activeMatch: '/guide/' },
      { text: 'Security', link: '/security/overview', activeMatch: '/security/' },
      {
        text: 'SDKs',
        activeMatch: '/sdk/',
        items: [
          {
            text: 'Frontend SDK',
            items: [
              { text: 'Quickstart (@jetpack/client)', link: '/sdk/frontend/quickstart' },
              { text: 'API Reference', link: '/sdk/frontend/api-reference' },
              { text: 'Binary Framing Protocol', link: '/sdk/frontend/binary-framing' },
            ],
          },
          {
            text: 'Worker SDK',
            items: [
              { text: 'Python SDK & GPU Wheels', link: '/sdk/worker/python-sdk' },
              { text: 'Native Runtimes (FFmpeg, etc.)', link: '/sdk/worker/native-runtimes' },
              { text: 'Volumes & Userspace Network', link: '/sdk/worker/volumes-and-network' },
            ],
          },
        ],
      },
      { text: 'Publishing', link: '/publishing/manifest-reference', activeMatch: '/publishing/' },
    ],

    sidebar: [
      {
        text: 'Guide',
        collapsed: false,
        items: [
          { text: 'Introduction & Philosophy', link: '/guide/introduction' },
          { text: 'Architecture & User Space', link: '/guide/architecture' },
          { text: 'Getting Started', link: '/guide/getting-started' },
        ],
      },
      {
        text: 'Security Audit',
        collapsed: false,
        items: [
          { text: 'Security Overview', link: '/security/overview' },
          { text: 'Pairing & Cryptography', link: '/security/pairing-and-crypto' },
          { text: 'OS Kernel Sandboxing', link: '/security/os-sandboxing' },
          { text: 'Signed Catalog & Anti-Spoofing', link: '/security/signed-catalog' },
        ],
      },
      {
        text: 'Frontend SDK',
        collapsed: false,
        items: [
          { text: 'Quickstart (@jetpack/client)', link: '/sdk/frontend/quickstart' },
          { text: 'API Reference', link: '/sdk/frontend/api-reference' },
          { text: 'Binary Framing Protocol', link: '/sdk/frontend/binary-framing' },
        ],
      },
      {
        text: 'Worker SDK',
        collapsed: false,
        items: [
          { text: 'Python SDK & GPU Wheels', link: '/sdk/worker/python-sdk' },
          { text: 'Native Runtimes', link: '/sdk/worker/native-runtimes' },
          { text: 'Volumes & Network Proxy', link: '/sdk/worker/volumes-and-network' },
        ],
      },
      {
        text: 'Publishing & CLI',
        collapsed: false,
        items: [
          { text: 'Manifest Reference (app.toml)', link: '/publishing/manifest-reference' },
          { text: 'CLI Tools Reference', link: '/publishing/cli-tools' },
          { text: 'Store Submission & Signing', link: '/publishing/store-submission' },
        ],
      },
    ],

    outline: {
      level: [2, 3],
      label: 'On this page',
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/jetpack-io/jetpack' },
    ],

    footer: {
      message: 'Zero-VM Local Compute Orchestrator · Rust + WebAssembly + OS Kernel Sandboxes',
      copyright: 'JetPack Platform Documentation',
    },
  },
});
