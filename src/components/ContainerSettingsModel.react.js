import _ from 'underscore';
import $ from 'jquery';
import React from 'react/addons';
import electron from 'electron';
const remote = electron.remote;
const dialog = remote.dialog;
import ContainerUtil from '../utils/ContainerUtil';
import containerActions from '../actions/ContainerActions';
import util from '../utils/Util';
import shell from 'shell';

var ContainerSettingsModel = React.createClass({
  mixins: [React.addons.LinkedStateMixin],

  contextTypes: {
    router: React.PropTypes.func
  },

  getInitialState: function () {
    let env = ContainerUtil.env(this.props.container) || [];
    var workspaceDir = '';
    _.each(env, e => {
      if (e[0] === 'QGIS_WORKSPACE') {
        workspaceDir = e[1];
      }
    });

    // check if image is supported
    let supported = false;
    if (this.props.container.Config.Image.indexOf('qgis-model') !== -1) {
      supported = true;
    }

    var dataDir = 'No Folder';
    _.each(this.props.container.Mounts, m => {
      if (m.Destination === workspaceDir) {
        dataDir = m.Source;
      }
    });

    //let [supported, openStdin, privileged] = ContainerUtil.mode(this.props.container) || [true, true, false];
    return {
      supported: supported,
      dataDir: dataDir,
      workspaceDir: workspaceDir
      //openStdin: openStdin,
      //privileged: privileged
    };
  },

  handleSaveModelOptions: function () {
    let parameter01 = this.state.parameter01;
    containerActions.update(this.props.container.Name, { parameter01: parameter01 });
  },

  handleChangeParameter01: function () {
    this.setState({
      tty: !this.state.tty
    });
  },

  handleChangeOpenStdin: function () {
    this.setState({
      openStdin: !this.state.openStdin
    });
  },

  handleChangePrivileged: function () {
    this.setState({
      privileged: !this.state.privileged
    });
  },

  handleReset: function () {
    dialog.showMessageBox({
      message: 'Are you sure you want to reset all model parameters?',
      buttons: ['Yes', 'No']
    }, index => {
      if (index === 0) {
        console.log('RESET NOW!');
        this.setState({
          dataDir: 'No Folder'
        });
      }
    });
  },

  handleSaveEnvVars: function () {
    let list = [];
    _.each(this.state.env, kvp => {
      let [, key, value] = kvp;
      if ((key && key.length) || (value && value.length)) {
        list.push(key + '=' + value);
      }
    });
    containerActions.update(this.props.container.Name, { Env: list });
  },

  handleChangeEnvKey: function (index, event) {
    let env = _.map(this.state.env, _.clone);
    env[index][1] = event.target.value;
    this.setState({
      env: env
    });
  },

  handleChangeEnvVal: function (index, event) {
    let env = _.map(this.state.env, _.clone);
    env[index][2] = event.target.value;
    this.setState({
      env: env
    });
  },

  handleAddEnvVar: function () {
    let env = _.map(this.state.env, _.clone);
    env.push([util.randomId(), '', '']);
    this.setState({
      env: env
    });
  },

  handleRemoveEnvVar: function (index) {
    let env = _.map(this.state.env, _.clone);
    env.splice(index, 1);

    if (env.length === 0) {
      env.push([util.randomId(), '', '']);
    }

    this.setState({
      env: env
    });
  },

  handleChooseDataDirClick: function () {
    dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] }, (filenames) => {
      if (!filenames) {
        return;
      }

      var directory = filenames[0];

      if (!directory || (!util.isNative() && directory.indexOf(util.home()) === -1)) {
        dialog.showMessageBox({
          type: 'warning',
          buttons: ['OK'],
          message: 'Invalid directory - Please make sure the directory exists and you can read/write to it.'
        });
        return;
      }

      // update the mount
      let mounts = _.clone(this.props.container.Mounts);
      _.each(mounts, m => {
        if (m.Destination === this.state.workspaceDir) {
          m.Source = util.windowsToLinuxPath(directory);
          m.Driver = null;
          console.log('Updated mount: ', JSON.stringify(m));
        }
      });
      let binds = mounts.map(m => {
        return m.Source + ':' + m.Destination;
      });
      let hostConfig = _.extend(this.props.container.HostConfig, { Binds: binds });
      containerActions.update(this.props.container.Name, { Mounts: mounts, HostConfig: hostConfig });

      // update the state
      this.setState({
        dataDir: directory
      });
    });
  },

  handleOpenDataDirClick: function (u, path) {
    if (u.isWindows()) {
      shell.showItemInFolder(u.linuxToWindowsPath(path));
    } else {
      shell.showItemInFolder(path);
    }
  },

  render: function () {
    if (!this.props.container) {
      return false;
    }

    let containerInfo = (
      <div className="settings-section">
        <h3>Container Info</h3>
        <div className="container-info-row">
          <div className="label-id">ID</div>
          <input type="text" className="line disabled" defaultValue={this.props.container.Id} disabled></input>
        </div>
        <div className="container-info-row">
          <div className="label-name">NAME</div>
          <input type="text" className="line disabled" defaultValue={this.props.container.Name} disabled></input>
        </div>
        <div className="container-info-row">
          <div className="label-name">IMAGE</div>
          <input type="text" className="line disabled" defaultValue={this.props.container.Config.Image} disabled></input>
        </div>
      </div>
    );

    if (!this.state.supported) {
      return (
        <div className="settings-panel">
          {containerInfo}
          <div className="settings-section">
            <div className="error">
              <p className="errorMessage">The container image <span className="image">{this.props.container.Config.Image}</span> does not support model parameters!</p>
            </div>
          </div>
        </div>
      );
    }

    let vars = _.map(this.state.env, (kvp, index) => {
      let [id, key, val] = kvp;
      let icon;
      if (index === this.state.env.length - 1) {
        icon = <a onClick={this.handleAddEnvVar} className="only-icon btn btn-positive small"><span className="icon icon-add"></span></a>;
      } else {
        icon = <a onClick={this.handleRemoveEnvVar.bind(this, index) } className="only-icon btn btn-action small"><span className="icon icon-delete"></span></a>;
      }

      return (
        <div key={id} className="keyval-row">
          <input type="text" className="key line" defaultValue={key} onChange={this.handleChangeEnvKey.bind(this, index) }></input>
          <input type="text" className="val line" defaultValue={val} onChange={this.handleChangeEnvVal.bind(this, index) }></input>
          {icon}
        </div>
      );
    });

    var dataDirSource = null;
    if (!this.state.dataDir) {
      dataDirSource = (
        <span className="value-right">No Folder</span>
      );
    } else {
      let local = util.isWindows() ? util.linuxToWindowsPath(this.state.dataDir) : this.state.dataDir;
      dataDirSource = (
        <a className="value-right" onClick={this.handleOpenDataDirClick.bind(this, util, this.state.dataDir)}>{local.replace(process.env.HOME, '~')}</a>
      );
    }
    var dataDirUI = (
      <tr>
          <td>{dataDirSource}</td>
          <td>
            <a className="btn btn-action small" disabled={this.props.container.State.Updating} onClick={this.handleChooseDataDirClick.bind(this) }>Change</a>
          </td>
        </tr>
    );

    return (
      <div className="settings-panel">

        {containerInfo}

        <div className="settings-section">
          <h3>Input Data Directory</h3>
          <table className="table volumes">
            <thead>
              <tr>
                <th>DATA FOLDER</th>
              </tr>
            </thead>
            <tbody>
              {dataDirUI}
            </tbody>
          </table>
        </div>

        <div className="settings-section">
          <h3>Model Options</h3>
          <div className="env-vars-labels">
            <div className="label-key">KEY</div>
            <div className="label-val">VALUE</div>
          </div>
          <div className="env-vars">
            {vars}
          </div>
          <a className="btn btn-action" disabled={this.props.container.State.Updating} onClick={this.handleSaveModelOptions}>Save</a>
        </div>

        <div className="settings-section">
          <h3>Reset</h3>
          <a className="btn btn-action" onClick={this.handleReset}>Reset model parameters</a>
        </div>
      </div>
    );
  }
});

module.exports = ContainerSettingsModel;
