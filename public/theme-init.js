document.documentElement.classList.add('kn-booting');
// Load the saved theme before the stylesheet paints, without inline scripts.
try {const saved=localStorage.getItem('kn.theme');document.documentElement.dataset.theme=['dark','light','system'].includes(saved)?saved:'system';} catch {document.documentElement.dataset.theme='system';}
