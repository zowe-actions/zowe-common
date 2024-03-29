/*
 * This program and the accompanying materials are made available under the terms of the
 * Eclipse Public License v2.0 which accompanies this distribution, and is available at
 * https://www.eclipse.org/legal/epl-v20.html
 *
 * SPDX-License-Identifier: EPL-2.0
 *
 * Copyright IBM Corporation 2021
 */

const utils = require('./utils.js')

class github {

    /**
     * Issue git command
     *
     * @param  workingDir      the working directory
     * @param  command         git command to issue
     */
    static _cmd(workingDir, command, quiet) {
        if (!workingDir) {
            console.warn('Git operation skipped, must specify working directory')
        } 
        else {
            var cmd=`git ${command}`
            const res = utils.sh(cmd, {cwd: workingDir})
            if (!quiet) {
                console.log('>>>', cmd, '\n', res, '\n<<<')
            } 
            return res
        }
    }

    /**
     * Validate if a tag exists in remote.
     *
     * @Example
     * <pre>
     *     if (github.tagExistsRemote('v1.2.3')) {
     *         echo "Tag v1.2.3 already exists in remote."
     *     }
     * </pre>
     *
     * @param tag     tag name to check
     * @return        true/false
     */
    static tagExistsRemote(tag) {
        var remotedTags = utils.sh('git ls-remote --tags').split("\n")
        var foundTag = false

        remotedTags.forEach(eachtag => {
            if (eachtag.endsWith(`refs/tags/${tag}`)) { 
                foundTag = true 
            }
        })
        return foundTag
    }

    /**
     * Tag the branch and push to remote.
     *
     * @Note Currently only support lightweighted tag.
     *
     * @param  tag           tag name to be created
     */
    static tag(tag) {
        // init with arguments
        if (!tag) {
            throw new Error('tag name is missing, failed to tag')
        }

        console.log(utils.sh(`git tag "${tag}" && git push origin "${tag}"`))
    }

    /**
     * Clone a remote repository
     *
     * @param  repo            the repository name, required 
     * @param  dir             the directory name to place the clone, required
     * @param  branch          the branch name to be cloned, optional
     * @param  shallow         flag to do shallow clone (just clone latest one history), optional
     */
    static clone(repo, dir, branch, shallow) {
        if (!repo || !dir) {
            console.warn('Clone operation skipped, must specify both mandatory arguments: repo, dir')
        } 
        else {
            var cmd = `mkdir -p ${dir} && git clone`
            if (branch) {
                if (shallow) {
                    cmd += ' --depth 1'
                }
                cmd += ` --single-branch --branch ${branch}`
            }
            var fullRepo = ` https://github.com/${repo}.git ${dir}`
            cmd += fullRepo
            utils.sh(cmd)
        }
    }

    /**
     * Hard reset a repository, removing all (/staged) changes
     *
     * @param  branch          the branch name to be reset, required
     * @param  workingDir      the working directory
     */
    static hardReset(branch, workingDir, quiet) {
        if (!branch) {
            console.warn('Hard reset operation skipped, must specify branch')
        } 
        else {
            return this._cmd(workingDir, `reset --hard ${branch}`, quiet)
        }
    }

    /**
     * Fetch latest changes from remote
     *
     * @param  workingDir      the working directory
     */
    static fetch(workingDir, quiet) {
        return this._cmd(workingDir, `fetch`, quiet)
    }

    /**
     * Pull down latest changes from remote
     *
     * @param  workingDir      the working directory
     */
    static pull(workingDir, quiet) {
        return this._cmd(workingDir, `pull`, quiet)
    }

    /**
     * Add file to commit
     *
     * @param  workingDir      the working directory
     * @param  file            file to add
     */
    static add(workingDir, file, quiet) {
        return this._cmd(workingDir, `add ${file}`, quiet)
    }

    /**
     * Create new commit
     *
     * @param  workingDir      the working directory
     * @param  message         commit message
     */
    static commit(workingDir, message, quiet) {
        return this._cmd(workingDir, `commit -s -m "${message}"`, quiet)
    }

    /**
     * Push committed changes to a remote repository
     *
     * @param  branch          the branch to be pushed to, required
     * @param  dir             the working directory, required
     */
    static push(branch, dir, username, passwd, repo, quiet) {
        if (!branch) {
            console.warn('Push operation skipped, must specify argument: branch')
        } 
        else {
            return this._cmd(dir, `push https://${username}:${passwd}@github.com/${repo} ${branch}`, quiet)
        }
    }

    /**
     * Check if current branch is synced with remote
     * 
     * @param  branch          the branch to be checked against, required
     * @param  dir             the working directory, required
     */
    static isSync(branch, dir) {
        // update remote
        utils.sh(`cd ${dir} && git fetch origin`)
        // get last hash
        var localHash = utils.sh(`cd ${dir} && git rev-parse ${branch}`)
        var remoteHash = utils.sh(`cd ${dir} && git rev-parse origin/${branch}`)

        if (localHash == remoteHash) {
            console.log('Working directory is synced with remote.')
            return true
        } else {
            console.warn(`Working directory is not synced with remote:
                local : ${localHash}
                remote: ${remoteHash}`)
            return false
        }
    }

    /**
     * Shallow clone a remote repository with latest
     *
     * @param  dir             the directory of where the this new branch checkouts to, required
     * @param  branch          the branch name to be newly made, required
    */
    static createOrphanBranch(dir, branch){
        if (!dir || !branch) {
            console.warn('createOrphanBranch operation skipped, must specify all three arguments: repo, dir and branch')
        }
        else {
            var cmd = `mkdir -p ${dir} && cd ${dir}`
            cmd += ` && git switch --orphan ${branch}`
            cmd += ' && git commit --allow-empty -m "Initial commit on orphan branch"'
            utils.sh(cmd)
        }
    }
}

module.exports = github;