// Mostrar toast si existe
(function () {
    const el = document.getElementById('appToast');
    if (el && window.bootstrap) new bootstrap.Toast(el, { delay: 2500 }).show();
})();

// Validación Bootstrap (needs-validation)
(function () {
    const forms = document.querySelectorAll('.needs-validation');
    Array.prototype.slice.call(forms).forEach((form) => {
        form.addEventListener('submit', (event) => {
            if (!form.checkValidity()) {
                event.preventDefault();
                event.stopPropagation();
            }
            form.classList.add('was-validated');
        }, false);
    });
})();
