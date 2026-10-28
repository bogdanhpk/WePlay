/* Available seasons come from player data, independently of the metadata total. */
(function(){
  'use strict';
  function number(value){if(typeof value!=='number'&&typeof value!=='string'||String(value).trim()==='')return null;var n=Number(value);return isFinite(n)&&n===Math.floor(n)&&n>0&&n<=500?n:null;}
  function episodeNumber(value){var n=Number(value);return value!==null&&value!==undefined&&String(value).trim()!==''&&isFinite(n)&&n===Math.floor(n)&&n>0&&n<=10000?n:null;}
  function ordered(episodes){return (episodes||[]).map(function(e,i){return {episode:e,index:i};}).sort(function(a,b){return (number(a.episode.season)||10001)-(number(b.episode.season)||10001)||(episodeNumber(a.episode.episode)||10001)-(episodeNumber(b.episode.episode)||10001)||a.index-b.index;}).map(function(entry){return entry.episode;});}
  function startIndex(episodes,season){season=number(season);if(!season)return -1;var found=-1,first=Infinity;(episodes||[]).forEach(function(e,i){if(number(e.season)!==season)return;var order=episodeNumber(e.episode)||10001;if(found<0||order<first){found=i;first=order;}});return found;}
  function resumeIndex(episodes,resume){if(!resume)return -1;var season=number(resume.season),episode=episodeNumber(resume.episode);if(!season||!episode)return episodes.length===1&&!number(episodes[0].season)?0:-1;return episodes.findIndex(function(e){return number(e.season)===season&&episodeNumber(e.episode)===episode;});}
  function group(episodes){
    var groups={};ordered(episodes).forEach(function(e,index){var season=number(e.season);if(!season)return;var episode=episodeNumber(e.episode),entry=groups[season]||(groups[season]={number:season,count:0,firstEpisode:episode,seen:{}}),key=episode===null?'index:'+index:String(episode);if(!entry.seen[key]){entry.seen[key]=true;entry.count++;}});
    return Object.keys(groups).map(function(key){var entry=groups[key];return {number:entry.number,count:entry.count,firstEpisode:entry.firstEpisode};}).sort(function(a,b){return a.number-b.number;});
  }
  function combine(lists){var found={};(lists||[]).forEach(function(list){(list||[]).forEach(function(s){if(number(s.number)&&!found[s.number])found[s.number]=s;});});return Object.keys(found).map(function(key){return found[key];}).sort(function(a,b){return a.number-b.number;});}
  function countLabel(n){var ten=n%10,hundred=n%100;return n+' '+(ten===1&&hundred!==11?'серия':ten>=2&&ten<=4&&(hundred<12||hundred>14)?'серии':'серий');}
  window.WePlaySeasons={number:number,ordered:ordered,startIndex:startIndex,resumeIndex:resumeIndex,group:group,combine:combine,countLabel:countLabel};
}());
