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
    // check if image is supported
    let defaultOptions = null;
    if (this.props.container.Config.Labels['de.ifgi.qgis-model.options']) {
      defaultOptions = JSON.parse(this.props.container.Config.Labels['de.ifgi.qgis-model.options']);
      console.log('Loaded options from LABEL: ' + JSON.stringify(defaultOptions));
    } else {
      let msg = 'No LABEL "de.ifgi.qgis-model.options" with defaults found.';
      console.log(msg);
      return {
        supported: false,
        message: msg
      };
    }

    // get workspace directory inside container
    let workspaceDir = null;
    let env = ContainerUtil.env(this.props.container) || [];
    _.each(env, e => {
      if (e[0] === 'QGIS_WORKSPACE') {
        workspaceDir = e[1];
      }
    });
    if (!workspaceDir) {
      let msg = 'No environment variable "QGIS_WORKSPACE" defined, cannot handle data directory';
      console.log(msg);
      return {
        supported: false,
        message: msg
      };
    }

    // use workspace directory to identify exising mount
    let dataDir = null;
    _.each(this.props.container.Mounts, m => {
      if (m.Destination === workspaceDir && m.Source && (m.Source.indexOf('/var/lib/docker/volumes') !== 0)) {
        dataDir = m.Source;
      }
    });

    // create options object
    let options = null;
    options = _.map(defaultOptions, _.clone);
    _.each(options, function (option) {
      // create default property
      option.default = option.value;

      // update options from env
      _.each(env, e => {
        if (e[0] === option.id) {
          option.value = e[1];
        }
      });
    });

    // save all options to env
    let list = [];
    _.each(options, option => {
      if ((option.id && option.id.length) || (option.value && option.value.length)) {
        list.push(option.id + '=' + option.value);
      }
    });
    containerActions.update(this.props.container.Name, { Env: list });


    return {
      supported: true,
      dataDir: dataDir,
      options: options
    };
  },

  handleReset: function () {
    dialog.showMessageBox({
      message: 'Are you sure you want to reset all model parameters?',
      buttons: ['Yes', 'No']
    }, index => {
      if (index === 0) {
        console.log('RESET NOW!');
        let resetOptions = _.map(this.state.options, _.clone);

        let list = [];
        _.each(resetOptions, option => {
          if ((option.id && option.id.length) || (option.value && option.value.length)) {
            list.push(option.id + '=' + option.value);
            option.value = option.default;
          }
        });
        containerActions.update(this.props.container.Name, { Env: list });

        this.setState({
          dataDir: null,
          options: resetOptions
        });
        // FIXME need to "save", too, but does not work
      }
    });
  },

  handleSaveOptions: function () {
    let list = [];
    _.each(this.state.options, option => {
      if ((option.id && option.id.length) || (option.value && option.value.length)) {
        list.push(option.id + '=' + option.value);
      }
    });
    containerActions.update(this.props.container.Name, { Env: list });
  },

  handleChangeOption: function (index, event) {
    let options = _.map(this.state.options, _.clone);
    options[index].value = event.target.value;

    this.setState({
      options: options
    });
  },

  // FIXME
  handleResetOption: function (index) {
    let options = _.map(this.state.options, _.clone);
    options[index].value = this.state.defaults[index].value;

    this.setState({
      options: options
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
              <p className="errorMessage">The image <span className="image">{this.props.container.Config.Image}</span> does not support model options!</p>
              <p className="errorMessage">{this.state.message}</p>
            </div>
          </div>
        </div>
      );
    }

    let options = _.map(this.state.options, (object, index) => {
      let title = object.comment || '';
      let name = object.name || object.id;

      return (
        <div key={object.id} className="keyval-row">
          <input type="text" className="key line disabled" defaultValue={name} title={title} disabled></input>
          <input type="text" className="val-narrow line" defaultValue={object.value} title={title} onChange={this.handleChangeOption.bind(this, index) }></input>
          <input type="text" className="val-default line disabled" defaultValue={object.default} title={title} disabled></input>
        </div>
      );
    });
    // <a onClick={this.handleResetOption.bind(this, index) } className="only-icon btn btn-action small"><span className="icon icon-delete"></span></a>

    var dataDirSource = null;
    if (!this.state.dataDir) {
      dataDirSource = (
        <span className="value-right">No Folder</span>
      );
    } else {
      let local = util.isWindows() ? util.linuxToWindowsPath(this.state.dataDir) : this.state.dataDir;
      dataDirSource = (
        <a className="value-right" onClick={this.handleOpenDataDirClick.bind(this, util, this.state.dataDir) }>{local.replace(process.env.HOME, '~') }</a>
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
            <div className="label-key">OPTION</div>
            <div className="label-val-narrow">VALUE</div>
            <div className="label-val-default">DEFAULT</div>
          </div>
          <div className="env-vars">
            {options}
          </div>
          <a className="btn btn-action" disabled={this.props.container.State.Updating} onClick={this.handleSaveOptions}>Save</a>
        </div>

      </div>
    );
    // <div className="settings-section">
    //   <h3>Reset</h3>
    //   <a className="btn btn-action" disabled={this.props.container.State.Updating} onClick={this.handleReset}>Reset model parameters</a>
    // </div>
  }
});

module.exports = ContainerSettingsModel;
