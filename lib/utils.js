/*
 * This program and the accompanying materials are made available under the terms of the
 * Eclipse Public License v2.0 which accompanies this distribution, and is available at
 * https://www.eclipse.org/legal/epl-v20.html
 *
 * SPDX-License-Identifier: EPL-2.0
 *
 * Copyright IBM Corporation 2021
 */

const { execSync } = require('child_process')
const fs = require('fs')
const semver = require('semver')
const Debug = require('debug')
const debug = Debug('zowe-actions:zowe-common:utils')

class utils {
    static sh(cmd, quiet) {
        debug('sh: $ '+cmd)
        var output = execSync(cmd).toString().trim()
        if (!quiet) {
            console.log(output)
        }
    }

    static fileExists(path) {
        try {
            fs.accessSync(path, fs.constants.F_OK)
            console.log(path+' does exist')
            return true
        } catch {
            console.warn(path+' does not exist')
            return false
        }
    }

    static parseSemanticVersion(version) {
        var versionMap = new Map()
        versionMap.set('major', semver.major(version))
        versionMap.set('minor', semver.minor(version))
        versionMap.set('patch', semver.patch(version))
        var prerelease = semver.prerelease(version)
        if (prerelease)
            versionMap.set('prerelease', ''+prerelease[0]+prerelease[1])
        debug('parseSemanticVersion '+versionMap['major']+'.'+versionMap['minor']+'.'+versionMap['patch']+ prerelease? '-'+versionMap['prerelease']:'')
        return versionMap
    }

    static nvmShellInit(nodeJsVersion, quiet) {
        var nvmScript = process.env.HOME + '/.nvm/nvm.sh'
        var cmds = new Array()
        cmds.push('set +x')
        cmds.push('. '+nvmScript)
        cmds.push('nvm install '+nodeJsVersion)
        cmds.push('npm install npm -g')
        cmds.push('npm install yarn -g')
        cmds.push('npm install ci -g')
        return this.sh(cmds.join(' && '), quiet)
    }

    static nvmShell(nodeJsVersion, scripts, quiet) {
        var nvmScript = process.env.HOME + '/.nvm/nvm.sh'
        var cmds = new Array()
        cmds.push('set +x')
        cmds.push('. '+nvmScript)
        cmds.push('nvm use '+nodeJsVersion)
        cmds.push('set -x')
        scripts.forEach(x => {
            cmds.push(x)
        });
        return this.sh(cmds.join(' && '), quiet)
    }

    static sanitizeBranchName(branch) {
        if (branch.startsWith('origin/')) {
            branch = branch.substring(7)
        }
        branch = branch.replaceAll(/[^a-zA-Z0-9]/, '-')
                       .replaceAll(/[\-]+/, '-')
                       .toLowerCase()

        return branch
    }
}
module.exports = utils;