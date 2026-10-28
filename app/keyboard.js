/* Remote-first inline keyboard: the search page never creates an editable native field. */
(function(){
  'use strict';
  var LAYOUTS={ru:['ЙЦУКЕНГШЩЗХЪ','ФЫВАПРОЛДЖЭ','ЯЧСМИТЬБЮЁ'].map(function(row){return Array.from(row);}),en:['QWERTYUIOP','ASDFGHJKL','ZXCVBNM'].map(function(row){return Array.from(row);}),numbers:[Array.from('1234567890'),[':', '-', '.', ',', '!', '?', '(', ')', '&', '/'],['+', "'", '@', '#']]};
  function text(value){return String(value||'').replace(/[\u0000-\u001f\u007f]/g,' ');}
  function model(value,cursor){
    var chars=Array.from(text(value)).slice(0,160),at=typeof cursor==='number'&&isFinite(cursor)?Math.max(0,Math.min(chars.length,Math.floor(cursor))):chars.length,selected=false;
    function clearSelection(){if(selected){chars=[];at=0;selected=false;return true;}return false;}
    return{get:function(){return{value:chars.join(''),cursor:at,selected:selected};},set:function(value,cursor){chars=Array.from(text(value)).slice(0,160);at=typeof cursor==='number'&&isFinite(cursor)?Math.max(0,Math.min(chars.length,Math.floor(cursor))):chars.length;selected=false;},insert:function(value){clearSelection();var input=Array.from(text(value)).slice(0,160-chars.length);chars.splice.apply(chars,[at,0].concat(input));at+=input.length;},backspace:function(){if(!clearSelection()&&at>0){chars.splice(--at,1);}},del:function(){if(!clearSelection())chars.splice(at,1);},move:function(delta){if(selected){at=delta<0?0:chars.length;selected=false;}else at=Math.max(0,Math.min(chars.length,at+delta));},home:function(){at=0;selected=false;},end:function(){at=chars.length;selected=false;},all:function(){selected=chars.length>0;at=chars.length;}};
  }
  function node(tag,cls,label){var n=document.createElement(tag);if(cls)n.className=cls;if(label!==undefined)n.textContent=label;return n;}
  function create(options){
    var saved=options.state||{},layout=saved.layout,preference='ru';try{preference=localStorage.getItem('lord.search-keyboard.v1')||'ru';}catch(ignore){}if(!LAYOUTS[layout])layout=LAYOUTS[preference]?preference:'ru';
    var data=model(options.value,saved.cursor),last=Object.assign({ru:0,en:0,numbers:0},saved.keys||{}),column=typeof saved.column==='number'&&isFinite(saved.column)?saved.column:.5,vertical=false,disposed=false,physical=false,frame=null;
    var display=options.display,clear=options.clear,submit=options.submit,root=node('section','tv-keyboard'),languages=node('div','tv-keyboard-languages'),letters=node('div','tv-keyboard-letters'),actions=node('div','tv-keyboard-actions'),keys=[],tabs={};root.id='search-keyboard';root.setAttribute('aria-label','Экранная клавиатура');languages.setAttribute('role','tablist');languages.setAttribute('aria-label','Раскладка клавиатуры');
    var scroll=node('span','query-scroll'),entry=node('span','query-entry'),before=node('span'),caret=node('span','query-caret'),after=node('span');caret.setAttribute('aria-hidden','true');entry.appendChild(before);entry.appendChild(caret);entry.appendChild(after);scroll.appendChild(entry);display.appendChild(scroll);display.setAttribute('aria-controls',root.id);
    function state(){return{layout:layout,cursor:data.get().cursor,keys:Object.assign({},last),column:column};}
    function remember(){if(options.onState)options.onState(state());}
    function paint(){
      var value=data.get(),chars=Array.from(value.value);display.value=value.value;display.setAttribute('aria-label',value.value?'Поисковый запрос: '+value.value:'Введите название фильма или сериала');display.classList.toggle('query-empty',!value.value);entry.classList.toggle('query-selected',value.selected);before.textContent=chars.slice(0,value.cursor).join('');after.textContent=value.value?chars.slice(value.cursor).join(''):'Фильм или сериал';
      if(frame)cancelAnimationFrame(frame);frame=requestAnimationFrame(function(){frame=null;if(disposed||!display.isConnected)return;var c=caret.getBoundingClientRect(),r=scroll.getBoundingClientRect(),scale=r.width/scroll.offsetWidth||1;if(c.right>r.right-12)scroll.scrollLeft+=(c.right-r.right+12)/scale;else if(c.left<r.left+4)scroll.scrollLeft+=(c.left-r.left-4)/scale;});remember();
    }
    function apply(change){var old=data.get().value;change(data);paint();if(old!==data.get().value&&options.onChange)options.onChange(data.get().value);}
    function controls(){return [display,clear].concat(Array.prototype.slice.call(root.querySelectorAll('button'))).concat([submit]).filter(function(b){return b&&!b.hidden&&!b.disabled&&b.offsetWidth;});}
    function position(button,row,start,span){button.setAttribute('data-key-row',row);button.setAttribute('data-key-start',start);button.setAttribute('data-key-span',span||1);}
    function focus(button,keepColumn){if(!button)return;vertical=!!keepColumn;options.focus(button,false);vertical=false;}
    function key(label,id,row,start,span,action,icon){var b=node('button','focusable tv-key',label);b.type='button';b.id=id;b.setAttribute('aria-label',label);position(b,row,start,span);if(icon){b.textContent='';var glyph=node('span','icon');glyph.setAttribute('aria-hidden','true');glyph.innerHTML=icon;b.appendChild(glyph);}b.onclick=action;return b;}
    function render(){
      letters.textContent='';keys=[];LAYOUTS[layout].forEach(function(row,rowIndex){var line=node('div','tv-keyboard-row'),offset=(12-row.length)/2;row.forEach(function(letter,col){var b=key(letter,'keyboard-key-'+keys.length,1+rowIndex,offset+col,1,function(){physical=false;apply(function(m){m.insert(letter.toLowerCase());});});b.style.gridColumn=String((offset+col)*2+1)+' / span 2';b.setAttribute('data-character',letter.toLowerCase());line.appendChild(b);keys.push(b);});letters.appendChild(line);});
      Object.keys(tabs).forEach(function(name){tabs[name].classList.toggle('selected',name===layout);tabs[name].setAttribute('aria-selected',String(name===layout));});last[layout]=Math.min(keys.length-1,Math.max(0,Number(last[layout])||0));remember();
    }
    [['ru','РУС'],['en','ENG'],['numbers','123']].forEach(function(spec,index){var b=key(spec[1],'keyboard-'+spec[0],0,index*4,4,function(){layout=spec[0];if(layout!=='numbers')try{localStorage.setItem('lord.search-keyboard.v1',layout);}catch(ignore){}render();});b.setAttribute('role','tab');b.setAttribute('aria-controls','keyboard-letters');tabs[spec[0]]=b;languages.appendChild(b);});letters.id='keyboard-letters';letters.setAttribute('role','group');letters.setAttribute('aria-label','Буквы и символы');
    var backspace='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="none" stroke="currentColor" stroke-width="16" stroke-linejoin="round" stroke-linecap="round"><path d="M80 48h144v160H80L16 128Z"/><path d="m120 96 64 64m0-64-64 64"/></svg>';
    actions.appendChild(key('Курсор влево','keyboard-cursor-left',4,0,2,function(){apply(function(m){m.move(-1);});},WEPLAY_ICONS['caret-left']));var space=key('Пробел','keyboard-space',4,2,6,function(){apply(function(m){m.insert(' ');});});space.classList.add('tv-key-space');actions.appendChild(space);actions.appendChild(key('Курсор вправо','keyboard-cursor-right',4,8,2,function(){apply(function(m){m.move(1);});},WEPLAY_ICONS['caret-right']));actions.appendChild(key('Удалить символ','keyboard-backspace',4,10,2,function(){apply(function(m){m.backspace();});},backspace));
    root.appendChild(languages);root.appendChild(letters);root.appendChild(actions);position(display,-1,0,11);position(clear,-1,11,1);position(submit,5,0,12);render();paint();
    function owned(target){return target===display||target===clear||target===submit||root.contains(target);}
    function focusLetter(){focus(keys[last[layout]]||keys[0],true);}
    function onFocus(e){var active=e.target;if(owned(active)){var index=keys.indexOf(active);if(index>=0)last[layout]=index;if(!vertical){var start=Number(active.getAttribute('data-key-start')),span=Number(active.getAttribute('data-key-span'))||1;column=start+span/2;}remember();}display.classList.toggle('query-editing',owned(active));}
    function active(){return !disposed&&root.isConnected&&(!options.active||options.active());}
    function paste(e){if(!active()||!e.clipboardData)return;var value=e.clipboardData.getData('text');if(!value)return;e.preventDefault();physical=true;focus(display);apply(function(m){m.insert(value);});}
    display.onclick=function(){physical=false;focusLetter();};document.addEventListener('focusin',onFocus);document.addEventListener('paste',paste);
    function handled(e){e.preventDefault();return true;}
    function navigate(e,code){
      var current=document.activeElement;if(!owned(current))return false;
      if(current===display){if(code===37||code===39){var s=data.get();if(code===37&&s.cursor===0&&!s.selected){if(options.onLeft)options.onLeft();}else if(code===39&&s.cursor===Array.from(s.value).length&&!s.selected){if(!clear.hidden)focus(clear);else if(options.onRight)options.onRight();}else apply(function(m){m.move(code===37?-1:1);});return handled(e);}if(code===40){focusLetter();return handled(e);}return false;}
      var list=controls(),row=Number(current.getAttribute('data-key-row')),target;
      if(code===37||code===39){var siblings=list.filter(function(b){return Number(b.getAttribute('data-key-row'))===row;}).sort(function(a,b){return Number(a.getAttribute('data-key-start'))-Number(b.getAttribute('data-key-start'));}),at=siblings.indexOf(current);target=siblings[at+(code===37?-1:1)];if(target)focus(target);else if(code===37&&options.onLeft)options.onLeft();else if(code===39&&options.onRight)options.onRight();}
      else{var rows=list.map(function(b){return Number(b.getAttribute('data-key-row'));}).filter(function(r){return code===38?r<row:r>row;});if(rows.length){var next=code===38?Math.max.apply(Math,rows):Math.min.apply(Math,rows),choices=list.filter(function(b){return Number(b.getAttribute('data-key-row'))===next;});choices.sort(function(a,b){function distance(b){var s=Number(b.getAttribute('data-key-start')),width=Number(b.getAttribute('data-key-span'))||1;return column<s?s-column:column>s+width?column-s-width:0;}return distance(a)-distance(b)||Math.abs(Number(a.getAttribute('data-key-start'))+(Number(a.getAttribute('data-key-span'))||1)/2-column)-Math.abs(Number(b.getAttribute('data-key-start'))+(Number(b.getAttribute('data-key-span'))||1)/2-column);});focus(choices[0],true);}else if(code===40&&options.onRight)options.onRight();else return false;}
      return handled(e);
    }
    return{root:root,state:state,value:function(){return data.get().value;},initial:function(){return keys[last[layout]]||keys[0];},focus:focusLetter,set:function(value,cursor){apply(function(m){m.set(value,cursor);});},clear:function(){apply(function(m){m.set('');});},key:function(e,code){
      if(!active())return false;var current=document.activeElement;
      if((e.ctrlKey||e.metaKey)&&code===65){physical=true;focus(display);apply(function(m){m.all();});return handled(e);}if(e.ctrlKey||e.metaKey||e.altKey)return false;
      var letter=e.key&&Array.from(e.key).length===1?e.key:code>=48&&code<=57?String.fromCharCode(code):'';
      if(letter){physical=true;focus(display);apply(function(m){m.insert(letter);});return handled(e);}
      if(code===8||code===46){physical=true;focus(display);apply(function(m){if(code===8)m.backspace();else m.del();});return handled(e);}
      if(code===35||code===36){physical=true;focus(display);apply(function(m){if(code===35)m.end();else m.home();});return handled(e);}
      if(code===65376){if(!e.repeat&&options.onSubmit)options.onSubmit();return handled(e);}
      if(code===13&&owned(current)){if(!e.repeat||current.id==='keyboard-backspace'){if(current===display&&physical&&options.onSubmit)options.onSubmit();else current.click();}return handled(e);}
      if(code>=37&&code<=40)return navigate(e,code);
      if(code===9&&owned(current)){var list=controls(),at=list.indexOf(current),to=at+(e.shiftKey?-1:1);if(list[to])focus(list[to]);else if(!e.shiftKey&&options.onRight)options.onRight();return handled(e);}return false;
    },dispose:function(){disposed=true;if(frame)cancelAnimationFrame(frame);document.removeEventListener('focusin',onFocus);document.removeEventListener('paste',paste);}};
  }
  window.WePlayKeyboard={model:model,create:create};
}());
