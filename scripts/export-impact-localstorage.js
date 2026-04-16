(() => {
  const keys = [
    'impact_projects',
    'impact_themes',
    'impact_albums',
    'impact_grammy_goals',
  ];

  const payload = {};
  for (const k of keys) payload[k] = localStorage.getItem(k) ?? '[]';

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'impact-local-export.json';
  a.click();
  URL.revokeObjectURL(a.href);

  console.log('Exported impact local storage.', keys.map((k) => ({ key: k, length: (payload[k] || '').length })));
})();
