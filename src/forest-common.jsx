
import React, { Component } from 'react';
import ReactDOM from 'react-dom';
import superagent from 'superagent';
import _ from 'lodash';
import core from './forest-core';

const uid2notify = {};
const notify2ws = {};

function doGet(url){
  return fetch(url).then(res => res.json());
}

function doPost(o){
  const data = _.omit(o, core.localProps);
  const uid = o.Notifying;
  return superagent.post(uid)
    .timeout({ response: 9000, deadline: 10000 })
    .set('Notify', core.notifyUID)
    .send(data)
    .then(x => x)
    .catch(e => console.error(e));
}

core.setNetwork({ doGet, doPost });

export default class ForestCommon extends Component {

  static wsInit(host,port){
    const ws = new WebSocket(`ws://${host}:${port}`);

    ws.onopen = () => {
      ws.send(JSON.stringify({ notifyUID: core.notifyUID }));
    };

    ws.onmessage = (message) => {
      const json = JSON.parse(message.data);
      if(json.notifyUID){
        console.log('ws init:', json);
        notify2ws[json.notifyUID]=ws;
      }
      else
      if(json.UID){
        console.log('ws incoming object:', json);
        const o = core.getObject(json.UID)
        if(o) core.setObjectState(json.UID, json)
        else core.storeObject(json);
      }
    };

    ws.onerror = (error) => {
    };
  }

  static cacheObjects(list){
    return core.cacheObjects(list);
  }

  static renderDOM(Cpt, rootId = 'root'){
    return new Promise((resolve, reject) => {
      ReactDOM.render(
        Cpt,
        document.getElementById(rootId),
        (err) => err ? reject(err) : resolve()
      );
    });
  }

  static spawnObject(o){
    return core.spawnObject(o);
  }

  static runEvaluator(uid, params){
    core.runEvaluator(uid, params);
  }

  static getObject(uid){
    return core.getObject(uid);
  }

  UID;
  userStateUID;

  constructor(props) {
    super(props)
    if(props.uid){
      this.state = core.getObject(props.uid);
      this.UID = props.uid;
    }
    else{
      this.state = {};
      this.UID = undefined;
    }
    this.userStateUID = core.spawnObject({ 'is': ['user', 'state'] });
    this.state.userState = this.userStateUID;  // hardwiring from obj to react
    this.object = this.object.bind(this);
    this.notify = this.notify.bind(this);
    this.state.ReactNotify = this.notify;      // hardwiring from obj to react
  }

  mounted = false;

  componentDidMount() { this.mounted = true; core.doEvaluate(this.UID); }

  componentWillUnmount() { this.mounted = false; }

  object(path, match) {
    return core.object(this.UID, path, match);
  }

  notify(){
    if(this.mounted) this.setState({});
  }

  onRead(name){
    const value = this.object(name);
    core.setObjectState(this.userStateUID, { [name]: value });
    return value;
  }

  onChange(name, value){
    core.setObjectState(this.userStateUID, { [name]: value });
  }

  KEY_ENTER = 13;

  onKeyDown(name, e){
    if (e.keyCode !== this.KEY_ENTER){
      core.setObjectState(this.userStateUID, { [name+'-submitted']: false });
      return;
    }
    core.setObjectState(this.userStateUID, { [name+'-submitted']: true });
    e.preventDefault();
  }
}
