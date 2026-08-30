const buttons=[...document.querySelectorAll('[data-lang-btn]')];
function setLang(lang){localStorage.setItem('lm-lang',lang);document.documentElement.lang=lang;document.querySelectorAll('[data-tr]').forEach(el=>{el.textContent=el.dataset[lang]||el.dataset.tr});buttons.forEach(b=>b.classList.toggle('active',b.dataset.langBtn===lang));}
buttons.forEach(b=>b.addEventListener('click',()=>setLang(b.dataset.langBtn)));
setLang(localStorage.getItem('lm-lang')||'tr');
const mt=document.querySelector('.mobile-toggle'), mm=document.querySelector('.mobile-menu');if(mt&&mm)mt.addEventListener('click',()=>mm.classList.toggle('open'));
