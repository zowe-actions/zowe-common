/*
 * This program and the accompanying materials are made available under the terms of the
 * Eclipse Public License v2.0 which accompanies this distribution, and is available at
 * https://www.eclipse.org/legal/epl-v20.html
 *
 * SPDX-License-Identifier: EPL-2.0
 *
 * Copyright IBM Corporation 2021
 */

const { execSync, spawnSync } = require('child_process')
const InvalidArgumentException = require('./invalid-argument-exception.js')
const fs = require('fs')
const semver = require('semver')

class utils {

    static sleep(ms) {
        return new Promise((resolve) => {
            setTimeout(resolve, ms);
        });
    }

    static dateTimeNow() {
        return (new Date()).toISOString().split('.')[0].replace(/[^0-9]/g, "")
    }

    static sh(cmd, options = {}) {
        return execSync(cmd, options).toString().trim()
    }

    static sh_heavyload(cmd) {
        spawnSync(cmd, { stdio: 'inherit', shell: true})
    }

    static fileExists(path, quiet) {
        try {
            fs.accessSync(path, fs.constants.F_OK)
            if (!quiet) {console.log(`${path} exists :D `)}
            return true
        } catch {
            if (!quiet) {console.warn(`${path} does not exist :(`)}
            return false
        }
    }

    static mandatoryInputCheck(varArg, inputName) {
        if (!varArg || varArg == '') {
            throw new InvalidArgumentException(inputName)
        }
    }

    static parseFileExtension(file) {
        var result = new Map()
        var KNOWN_DOUBLE_EXTS = ['.tar.gz', '.pax.Z']

        var baseName = file.lastIndexOf('/') != -1 ? file.substring(file.lastIndexOf('/')+1) : file

        var idx = -1

        // some file names end with .tar.gz we want to keep
        KNOWN_DOUBLE_EXTS.forEach( ext => {
            if (baseName.endsWith(ext)) {
                idx = baseName.length - ext.length
            }
        })

        if (idx == -1) {
            idx = baseName.lastIndexOf('.')
        }

        if (idx != -1) {
            result.set('name', baseName.substring(0,idx))
            result.set('ext', baseName.substring(idx))
        } else {
            result.set('name', baseName)
            result.set('ext', '')
        }

        return result
    }

    static parseSemanticVersion(version) {
        var versionJson = {}
        versionJson['major'] = semver.major(version)
        versionJson['minor'] = semver.minor(version)
        versionJson['patch'] = semver.patch(version)
        const prerelease = semver.prerelease(version);
        versionJson['prerelease'] = prerelease ? (Array.isArray(prerelease) ? prerelease.join('.') : String(prerelease)) : ''
        return versionJson
    }

    static combineSemanticVersion(versionJson) {
        let version = `${versionJson['major']}.${versionJson['minor']}.${versionJson['patch']}`;
        if (versionJson['prerelease']) {
            version += `-${versionJson['prerelease']}`;
        }

        return version;
    }

    static bumpManifestVersion(manifest, version) {
        if (version == '') {
            version = 'PATCH';
        }

        const oldVersionLine = this.sh(`cat ${manifest} | grep 'version:'`);
        if (!oldVersionLine) {
            console.log(`Version is not defined in ${manifest}`);
            return;
        }
        const oldVersion = oldVersionLine.split(':')[1].trim();
        let oldVersionParsed = this.parseSemanticVersion(oldVersion);

        switch (version.toUpperCase()) {
            case 'PATCH':
                oldVersionParsed['patch'] = parseInt(oldVersionParsed['patch'], 10) + 1;
                break;
            case 'MINOR':
                oldVersionParsed['minor'] = parseInt(oldVersionParsed['minor'], 10) + 1;
                break;
            case 'MAJOR':
                oldVersionParsed['major'] = parseInt(oldVersionParsed['major'], 10) + 1;
                break;
            default:
                oldVersionParsed = this.parseSemanticVersion(version);
                break;
        }
        const newVersion = this.combineSemanticVersion(oldVersionParsed);

        const manifestContent = fs.readFileSync(manifest).toString();
        fs.writeFileSync(manifest, manifestContent.replace(/^version:.*$/m, `version: ${newVersion}`));

        return `v${newVersion}`;
    }

    static printMap (map) {
        for (const [key, value] of map.entries()) {
            console.log(`${key}: ${value ? value : 'null'}`);
        }
    }

    static nvmShellInit(nodeJsVersion) {
        var nvmScript = `${process.env.HOME}/.nvm/nvm.sh`
        var cmds = new Array()
        cmds.push(`set +x`)
        cmds.push(`. ${nvmScript}`)
        cmds.push(`nvm install ${nodeJsVersion}`)
        cmds.push(`npm install npm -g`)
        cmds.push(`npm install yarn -g`)
        cmds.push(`npm install ci -g`)
        return this.sh(cmds.join(' && '))
    }

    static nvmShell(nodeJsVersion, scripts) {
        var nvmScript = `${process.env.HOME}/.nvm/nvm.sh`
        var cmds = new Array()
        cmds.push(`set +x`)
        cmds.push(`. ${nvmScript}`)
        cmds.push(`nvm use ${nodeJsVersion}`)
        cmds.push(`set -x`)
        scripts.forEach(x => {
            cmds.push(x)
        });
        return this.sh(cmds.join(' && '))
    }

    static sanitizeBranchName(branch) {
        if (branch.startsWith('origin/')) {
            branch = branch.substring(7)
        }
        branch = branch.replace(/[^a-zA-Z0-9]/g, '-')
                       .replace(/[\-]+/g, '-')
                       .toLowerCase()
        return branch
    }

    static searchDefaultBranches() {
        var defaultBranchesJsonObject = JSON.parse(process.env.DEFAULT_BRANCHES_JSON_TEXT)
        for (var i=0; i < defaultBranchesJsonObject.length; i++) {
            var branch = defaultBranchesJsonObject[i]
            if (process.env.CURRENT_BRANCH.match(branch.name)) {
                return branch
            }
        }
    }

    static sftp(host, port, username, passwd, cmds) {
        var fullCMD = `SSHPASS=${passwd} sshpass -e sftp -o BatchMode=no -o StrictHostKeyChecking=no -P ${port} -b - ${username}@${host} <<EOF
${cmds}
EOF`
        this.sh_heavyload(fullCMD)
    }

    static sftpKeyFile(server, keyPassPhrase, cmds) {
        var fullCMD = `SSHPASS=${keyPassPhrase} sshpass -e -P "passphrase for key" sftp ${server} <<EOF
${cmds}
exit 0
EOF`
        this.sh_heavyload(fullCMD)
    }

    static ssh(host, port, username, passwd, cmds) {
        var fullCMD = `SSHPASS=${passwd} sshpass -e ssh -tt -o StrictHostKeyChecking=no -p ${port} ${username}@${host} <<EOF
${cmds}
exit 0
EOF`
        this.sh_heavyload(fullCMD)
    }

    static sshKeyFile(server, keyPassPhrase, cmds) {
        var fullCMD = `SSHPASS=${keyPassPhrase} sshpass -e -P "passphrase for key" ssh ${server} <<EOF
${cmds}
exit 0
EOF`
        this.sh_heavyload(fullCMD)
    }
}

module.exports = utils;