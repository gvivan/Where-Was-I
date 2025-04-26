window.addEventListener('DOMContentLoaded', () => {
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('folderRecreated') === 'true') {
    const alertElement = document.getElementById('folderRecreatedAlert');
    if (alertElement) {
      alertElement.style.display = 'block';
    }
  }
}); 