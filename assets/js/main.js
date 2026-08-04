(function(){
    var path = window.location.pathname.toLowerCase();
    var links = document.querySelectorAll('.sidebar a');

    links.forEach(function(link){
        var href = link.getAttribute('href');
        if (!href) {
            return;
        }

        var normalizedHref = href.replace('./', '').toLowerCase();
        if (
            path.endsWith(normalizedHref) ||
            (path.endsWith('/') && normalizedHref === 'index.html')
        ) {
            link.classList.add('is-active');
        }
    });
})();
