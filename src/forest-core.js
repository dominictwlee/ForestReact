
import _ from 'lodash';

const debugall = false;
const debugevaluate = debugall || false;
const debugchanges = debugall || false;
const debugnotify = debugall || false;
const debugobject = debugall || false;
const debugnet = debugall || false;
const debugpersist = debugall || false;

const localProps = ['Notifying', 'Alerted', 'Timer', 'TimerId', 'Evaluator', 'Cache', 'ReactNotify', 'userState'];
const noPersistProps = [ 'TimerId' ];

function makeUID(rem){
  /*jshint bitwise:false */
  let i, random;
  let uuid = '';
  for (i = 0; i < 32; i++) {
    random = Math.random() * 16 | 0;
    if (i === 8 || i === 12 || i === 16 || i === 20) uuid += '-';
    uuid += (i === 12 ? 4 : (i === 16 ? (random & 3 | 8) : random)).toString(16);
  }
  return (!rem? 'uid-': 'rem-') + uuid;
}

function difference(a, b) {
  function changes(a, b) {
    return _.transform(b, function(result, value, key) {
      if (!_.isEqual(value, a[key])) {
        result[key] = (_.isObject(value) && _.isObject(a[key])) ? changes(value, a[key]) : value;
      }
    });
  }
  return changes(a, b);
}

let persistence = null;
let network = null;

function setPersistence(p){ persistence = p; }

function setNetwork(n){ network = n; }

const objects = {};

function getCachedObject(u){
  return objects[toUID(u)]
}

function getObject(u){
  const uid=toUID(u);
  const o = objects[uid]
  if(o || !(persistence && persistence.fetch)) return Promise.resolve(o)
  return persistence.fetch(uid).then(o=>{
    objects[uid]=o;
    return o;
  })
}

const toSave = {};

function cachePersistAndNotify(o){
  cacheAndPersist(o, true);
}

function cacheAndPersist(o, notify){
  const uid=toUID(o.UID);
  objects[uid]=o;
  if(persistence && persistence.persist) toSave[uid]=(toSave[uid] || notify || false);
  else if(notify) notifyObservers(o);
}

setInterval(()=>{ persistenceFlush().then((a)=> (a.length && debugpersist && console.log(a)))}, 10);

function persistenceFlush(){
  return Promise.all(Object.keys(toSave).map(uid=>{
    return getObject(uid).then(o=>{
      const notify = toSave[uid];
      delete toSave[uid];
      return persistence.persist(_.omit(o, noPersistProps)).then(r => { if(notify) notifyObservers(o); return r; });
    })
  }))
}

function reCacheObjects(){
  if(persistence && persistence.recache){
    return persistence.recache().then(actives=>actives.map(o=>{
      objects[o.UID]=o;
      runEvaluator(o.UID);
      return o;
    }))
  }
  return Promise.resolve([]);
}

function dumpCache(){
  console.log('---------cache-------');
  Object.keys(objects).map(k => console.log(objects[k]));
  console.log('---------------------');
}

function spawnObject(o){
  const UID = o.UID || makeUID();
  const Notify = o.Notify || [];
  cachePersistAndNotify(Object.assign({ UID, Notify, Version: 1 }, o));
  doEvaluate(UID);
  return UID;
}

function cacheObjects(list){
  return list.map(o => spawnObject(o));
}

let fetching = {};

function doGet(url){
  if(!fetching[url]){
    fetching[url]=true;
    network && network.doGet(url)
      .then(json => { fetching[url]=false; incomingObjectFromGET(url, json); })
      .catch(e => { fetching[url]=false; console.error('doGet',e,url); });
  }
}

function ensureObjectState(u, obsuid){
  const o = getCachedObject(u);
  if(o){
    if(isURL(u) && (o.Updated||0)+10000 < Date.now()){
      doGet(u);
    }
    if(obsuid) setNotify(o,obsuid);
    return o;
  }
  getObject(u).then(o=>{
    if(o){
      if(isURL(u) && (o.Updated||0)+10000 < Date.now()){
        doGet(u);
      }
      if(obsuid){ setNotify(o,obsuid); doEvaluate(obsuid, { Alerted: o.UID }); }
    }
    else if(isURL(u) && obsuid){
      cacheAndPersist({ UID: u, Notify: [ obsuid ], Version: 0, Remote: toRemote(u), Updated: 0 });
      doGet(u);
    }
  })
  return null;
}

function setNotify(o,uid,savelater){
  if(!o.Notify.find(n=>valMatch(n,uid))){
    o.Notify.push(uid);
    if(!savelater) cacheAndPersist(o)
  }
}

function isRemote(uid){
  return getObject(uid).then(o=>o && o.Remote)
}

function isShell(o){
  return o.Remote && !o.Updated;
}

function notifyObservers(o){
  const allNotify = _.uniq([].concat(o.Notifying||[]).concat(o.Notify||[]));
  if(debugnotify) console.log('===========================\no.UID/is/Remote:', `${o.UID} / ${o.is} / ${o.Remote||'--'}`);
  const remotes = {};
  Promise.all(allNotify.map(u => getObject(u).then(n=>{
    if(debugnotify) console.log('------------------------');
    if(debugnotify) console.log('remotes start', remotes, o.UID, o.is)
    if(debugnotify) console.log('n.UID/is/Remote:', (n && (`${n.UID} / ${n.is} / ${n.Remote||'--'}`))||'--', u, toRemote(u));
    if(!n){
      if(isURL(u) || isNotify(u)){
        if(debugnotify) console.log(isURL(u) && 'isURL' || '', isNotify(u) && 'isNotify' || '');
        const Remote=toRemote(u);
        if(debugnotify) console.log('Remote',Remote)
        if(o.Remote !== Remote){
          if(!remotes[Remote]) remotes[Remote]=[u]
          else                 remotes[Remote].push(u);
        }
      }
    }
    else {
      if(n.Remote){
        if(debugnotify) console.log('n.Remote');
        if(o.Remote !== n.Remote){
          if(!remotes[n.Remote]) remotes[n.Remote]=[n.UID]
          else                   remotes[n.Remote].push(n.UID)
        }
      }
      else {
        if(debugnotify) console.log('local eval');
        doEvaluate(n.UID, { Alerted: o.UID });
      }
    }
    if(debugnotify) console.log('remotes now', remotes)
    if(debugnotify) console.log('\n------------------------');
  })
  .catch(e => console.log(e))
  ))
  .then(()=>Object.keys(remotes).map(u => outgoingObject(Object.assign({}, o, { Notify: remotes[u] }), u)));
}

function outgoingObject(o,u){
  network && network.doPost(o,u).then((ok) => {
    if(debugnet){
      if(ok) console.log('-------------->> outgoingObject\n', JSON.stringify(o, null, 4), u);
      else console.log('no outgoingObject for', u)
    }
  });
}

function incomingObjectFromGET(url, json){
  json = Object.assign({ Updated: Date.now() }, json)
  if(debugnet) console.log('<<-------------- incomingObjectFromGET\n', JSON.stringify(json, null, 4));
  updateObject(url, json)
}

function incomingObject(json, notify){
  if(!json.Notify) json.Notify=[]
  if(!json.Remote) json.Remote=toRemote(json.UID)
  json = Object.assign({ Updated: Date.now() }, json)
  if(notify) setNotify(json, notify, true);
  if(debugnet) console.log('<<-------------- incomingObject\n', JSON.stringify(json, null, 4), notify);
  getObject(json.UID).then(o=>{
    if(!o) storeObject(json);
    else updateObject(json.UID, json)
  })
}

function storeObject(o){
  if(!o.UID)     return;
  if(!o.Notify)  o.Notify = [];
  if(!o.Version) o.Version = 1;
  cachePersistAndNotify(o);
}

function updateObject(uid, update){
  if(!uid) return null
  const o=getCachedObject(uid)
  if(!o) return null;
  if(debugchanges) console.log(uid, 'before\n', JSON.stringify(o,null,4),'\nupdate:\n',JSON.stringify(update,null,4));
  if(o.Version && update.Version && o.Version >= update.Version){
    console.log('incoming version not newer:', o.Version, 'not less than', update.Version);
    return null;
  }
  const p=mergeUpdate(o, update);
  checkTimer(p);
  const changed = !_.isEqual(o,p);
  const justtimeout = changed && _.isEqual(difference(o,p), { Timer: 0 });
//const justupdated = _.isEqual(diff, { Updated: .. }); // also needed for Version: ?
  if(debugchanges) console.log('diff:', difference(o,p), 'changed:', changed, 'justtimeout:', justtimeout /*, 'justupdated:', justupdated*/);
  if(changed){
    if(!justtimeout && !update.Version) p.Version = (p.Version||0)+1;
    if(debugchanges) console.log('changed, result\n', JSON.stringify(p,null,4));
    if(!justtimeout) cachePersistAndNotify(p);
    else             cacheAndPersist(p);
  }
  return (changed && !justtimeout)? p: null;
}

function mergeUpdate(o,update){
  const updateNotify=update.Notify; delete update.Notify;
  const p=Object.assign({}, o, update);
  updateNotify && updateNotify.forEach(un=>setNotify(p,un,true))
  return _.omitBy(p, v => v===null||v===undefined||v===''||v===[]);
}

function isLink(u){
  return isUID(u) || isURL(u) || isNotify(u);
}

function isUID(u){
  return u.constructor === String && /^uid-/.test(u);
}

function isURL(u){
  return u.constructor === String && /^https?:\/\//.test(u);
}

function isNotify(u){
  return u.constructor === String && /^rem-/.test(u);
}

function toUID(u){
  if(!isURL(u)) return u;
  const s=u.indexOf('uid-');
  if(s=== -1) return u;
  return u.substring(s);
}

function toRemote(u){
  if(!isURL(u)) return u;
  const s=u.indexOf('uid-')
  if(s=== -1) return u;
  return u.substring(0,s)+'notify';
}

const isQueryableCacheListLabels = ['queryable', 'cache', 'list'];

function cacheQuery(o, uid, query){
  setNotify(o,uid);
  if(!persistence) return Promise.resolve([]);
  const scope = o.list;
  if(scope.includes('local') || scope.includes('remote')){
    return persistence.query(o.is.filter(s => !isQueryableCacheListLabels.includes(s)), scope, query);
  }
  return Promise.resolve([]);
}

function object(u,p,q) { const r = ((uid, path, query)=>{
  if(!uid || !path) return null;
  const o=getCachedObject(uid)
  if(!o) return null;
  const hasMatch = query && query.constructor===Object && query.match
  if(path==='.') return o;
  const pathbits = path.split('.');
  let c=o;
  for(let i=0; i<pathbits.length; i++){
    if(pathbits[i]==='') return c;
    if(pathbits[i]==='Timer') return c.Timer || 0;

    const isQueryableCacheList = c.is && c.is.constructor===Array && isQueryableCacheListLabels.every(s => c.is.includes(s));
    if(pathbits[i]==='list' && isQueryableCacheList && hasMatch) return cacheQuery(c, uid, query);

    const val = c[pathbits[i]];
    if(val == null) return null;
    if(i==pathbits.length-1){
      if(!hasMatch) return val;
      if(val.constructor === Array){
        if(query.match.constructor===Array){
          return (query.match.length <= val.length && query.match.every(q => val.find(v=>valMatch(q,v))) && val) || null;
        }
        const r = val.filter(v => {
          if(valMatch(v, query.match)) return true;
          if(isLink(v) && query.match.constructor===Object){
            const p=ensureObjectState(v, observingMatcher(query.match) && uid);
            if(!p) return false;
            return Object.keys(query.match).every(k => valMatch(p[k], query.match[k]));
          }
          if(v.constructor===Object){
            return Object.keys(query.match).every(k => valMatch(v[k], query.match[k]));
          }
          return false;
        });
        return (r.length && r) || null;
      }
      return valMatch(val,query.match)? val: null;
    }
    if(val.constructor === Object){ c = val; continue; }
    if(val.constructor === String){
      c = ensureObjectState(val, uid);
      if(!c) return null;
    }
  }
  })(u,p,q);
  if(debugobject) console.log('object', getCachedObject(u), '\npath:', p, q && 'query:' || '', q || '', '=>', r);
  return r;
}

function valMatch(a, b){
  return a == b || ((isURL(a) || isURL(b)) && toUID(a) === toUID(b));
}

function observingMatcher(match){
  return !_.isEqual(Object.keys(match), [ 'UID' ]);
}

function checkTimer(o){
  const time=o.Timer;
  if(time && time > 0 && !o.TimerId){
    o.TimerId = setTimeout(() => {
      getCachedObject(o.UID).TimerId = null;
      updateObject(o.UID, { Timer: 0 });
      doEvaluate(o.UID);
    }, time);
  }
}

function setPromiseState(uid, p){
  p.then(update => {
    if(debugevaluate) console.log('<<<<<<<<<<<<< promised update:\n', update);
    const o = updateObject(uid, update);
  });
  return {};
}

function doEvaluate(uid, params) {
  let o = getCachedObject(uid);
  if(!o) return;
  const evaluator = o.Evaluator && (typeof o.Evaluator === 'function'? o.Evaluator: evaluators[o.Evaluator]);
  if(!evaluator) return;
  const Alerted = params && params.Alerted;
  const reactnotify = o.ReactNotify;
  for(let i=0; i<4; i++){
    if(debugevaluate) console.log(`iteration ${i}`);
    if(debugevaluate) console.log('>>>>>>>>>>>>>\n', object(uid, '.'));
    if(debugevaluate && object(uid, 'userState.')) console.log('>>>>>user>>>>\n', object(uid, 'userState.'));
    if(Alerted) o.Alerted=Alerted;
    const evalout = evaluator(object.bind(null, uid), params);
    delete o.Alerted;
    if(!evalout){ console.error('no evaluator output for', uid, o); return; }
    let update;
    if(evalout.constructor === Array){
      update = Object.assign({}, ...(evalout.map(x => (x && x.constructor === Promise)? setPromiseState(uid,x): (x || {}))))
    }
    else update = evalout;
    if(debugevaluate) console.log('<<<<<<<<<<<<< update:\n', update);
    o = updateObject(uid, update);
    if(!o) break;
  }
  if(reactnotify) reactnotify();
}

function runEvaluator(uid, params){
  return getObject(uid).then(()=>doEvaluate(uid, params));
}

const evaluators = {}

function setEvaluator(name, evaluator){
  evaluators[name]=evaluator
}

export default {
  makeUID,
  toUID,
  spawnObject,
  storeObject,
  cacheObjects,
  reCacheObjects,
  setNotify,
  updateObject,
  incomingObject,
  object,
  runEvaluator,
  setEvaluator,
  getObject,
  setPersistence,
  setNetwork,
  localProps,
  isURL,
  isNotify,
}

