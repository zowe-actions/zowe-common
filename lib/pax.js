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
const debug = Debug('zowe-actions:zowe-common:pax')
const InvalidArgumentException = require('./invalid-argument-exception.js')
const utils = require('./utils.js')
const PATH_CONTENT = 'content'
const PATH_ASCII = 'ascii'
const HOOK_PREPARE_WORKSPACE = 'prepare-workspace.sh'
const HOOK_PRE_PACKAGING = 'pre-packaging.sh'
const HOOK_POST_PACKAGING = 'post-packaging.sh'
const HOOK_CATCHALL_PACKAGING = 'catchall-packaging.sh'

class pax {
    /**
     * Create PAX Package
     *
     * @param   job             job identifier
     * @param   filename        package file name will be created
     * @param   extraFiles      extra artifacts will be generated and should be transferred back
     * @param   environments    environment variables
     * @param   paxOptions      pax write command options
     * @param   compress        if we want to compress the result
     * @param   compressOptions compress command options
     * @param   keepTempFolder  if we want to keep the temporary packaging folder on the remote machine
     *                          for debugging purpose. Default is false.
     * @return                  pax package created
     */
    static pack(args) {
        const func = 'pack:'
        
        const job = args['job']
        const paxSSHHost = args['paxSSHHost']
        const paxSSHPort = args['paxSSHPort']
        const paxSSHUsername = args['paxSSHUsername']
        const paxSSHPassword = args['paxSSHPassword']
        const paxOptions = args['paxOptions']
        const compress = args['compress']
        const paxLocalWorkspace = args['paxLocalWorkspace']
        const paxRemoteWorkspace = args['paxRemoteWorkspace']
        const filename = args['filename']
        const compressOptions = args['compressOptions']
        const extraFilesArg = args['extraFiles']
        var keepTempFolderArg = args['keepTempFolder']
        const environments = args['environments']

        // validate arguments
        if (!paxSSHHost) {
            throw new InvalidArgumentException('paxSSHHost')
        }
        if (!paxSSHPort) {
            throw new InvalidArgumentException('paxSSHPort')
        }
        if (!paxSSHUsername) {
            throw new InvalidArgumentException('paxSSHUsername')
        }
        if (!paxSSHPassword) {
            throw new InvalidArgumentException('paxSSHPassword')
        }
        if (!job) {
            throw new InvalidArgumentException('job')
        }
        if (!filename) {
            throw new InvalidArgumentException('filename')
        }

        var environmentText = ""
        if (environments) {
            try {
                environments.forEach((k,v) => {
                    environmentText += 'k'+'='+'v '
                })
                console.log(func+' pre-defined environments: '+environmentText)
            } catch (err) {
                console.warn(func+' [WARN] failed to prepare environments: '+environments+'\n'+err)
            }
        }
        var keepTempFolder = false
        if (keepTempFolderArg) {
            keepTempFolder = true
        }
        var compressPax = 'NO'
        if (compress) {
            compressPax = 'YES'
        }

        var filePax = filename
        var filePaxZ = filename
        if (compressPax) {
            if (filePax.endsWith('.Z')) {
                filePax = filePax.slice(0, -2) //get the part before .Z
            } else {
                filePaxZ = filePax + '.Z'
            }
        }
        var extraFiles = []
        if (extraFilesArg) {
            if (extraFilesArg.constructor === String) {
                extraFiles = extraFilesArg.split(',')
            }
            else if (extraFilesArg instanceof Array) {
                if (extraFilesArg.length > 0) {
                    extraFiles = extraFilesArg
                }
            } else if (extraFilesArg) {
                
                throw new InvalidArgumentException('extraFiles', 'extraFiles with type '+extraFilesArg.constructor.name+' is not accepted')
            }
        }
        var processUid = job+'-'+Date.now()
        var remoteWorkspaceFullPath = paxRemoteWorkspace+'/'+processUid
        var packageTar = processUid+'.tar'
        var packageScriptFile = processUid+'.sh'
        var packageScriptContent = `#!/bin/sh -e
set +x

if [ -z "${paxRemoteWorkspace}" ]; then
  echo "${func}[ERROR] paxRemoteWorkspace is not set"
  exit 1
fi
if [ -z "${job}" ]; then
  echo "${func}[ERROR] job id is not set"
  exit 1
fi

echo "${func} working in ${remoteWorkspaceFullPath} ..."
mkdir -p "${remoteWorkspaceFullPath}"
cd "${remoteWorkspaceFullPath}"

# extract tar file
if [ -f "${paxRemoteWorkspace}/${packageTar}" ]; then
  echo "${func} extracting ${paxRemoteWorkspace}/${packageTar} to ${remoteWorkspaceFullPath} ..."
  pax -r -x tar -f "${paxRemoteWorkspace}/${packageTar}"
  if [ \$? -ne 0 ]; then
    echo "${func}[ERROR] failed on untar package"
    exit 1
  fi
  rm "${paxRemoteWorkspace}/${packageTar}"
else
  echo "${func}[ERROR] tar ${paxRemoteWorkspace}/${packageTar} file doesn't exist"
  exit 1
fi

# do we have ascii.tar?
cd "${remoteWorkspaceFullPath}"
if [ -f "${PATH_ASCII}.tar" ]; then
  echo "${func} extracting ${remoteWorkspaceFullPath}/${PATH_ASCII}.tar ..."
  pax -r -x tar -o to=IBM-1047 -f "${PATH_ASCII}.tar"
  # copy to target folder
  cp -R ${PATH_ASCII}/. ${PATH_CONTENT}
  # remove ascii files
  rm "${PATH_ASCII}.tar"
  rm -fr "${PATH_ASCII}"
fi

# run pre hook
cd "${remoteWorkspaceFullPath}"
if [ -f "${HOOK_PRE_PACKAGING}" ]; then
  echo "${func} running pre hook ..."
  iconv -f ISO8859-1 -t IBM-1047 ${HOOK_PRE_PACKAGING} > ${HOOK_PRE_PACKAGING}.new
  mv ${HOOK_PRE_PACKAGING}.new ${HOOK_PRE_PACKAGING}
  chmod +x ${HOOK_PRE_PACKAGING}
  echo "${func} launch: ${environmentText} ./${HOOK_PRE_PACKAGING}"
  ${environmentText} ./${HOOK_PRE_PACKAGING}
  if [ \$? -ne 0 ]; then
    echo "${func}[ERROR] failed on pre hook"
    exit 1
  fi
fi

# list working folder
cd ${remoteWorkspaceFullPath}
echo "${func} content of ${remoteWorkspaceFullPath} starts >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>"
ls -TREal
echo "${func} content of ${remoteWorkspaceFullPath} ends   <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<"

# create PAX file
if [ -d "${remoteWorkspaceFullPath}/${PATH_CONTENT}" ]; then
  echo "${func} creating package ..."
  echo "${func}   ${remoteWorkspaceFullPath}/${PATH_CONTENT}\$ pax -w -f ${remoteWorkspaceFullPath}/${filePax} ${paxOptions ? paxOptions : ''} *"
  cd "${remoteWorkspaceFullPath}/${PATH_CONTENT}"
  pax -w -f "${remoteWorkspaceFullPath}/${filePax}" ${paxOptions ? paxOptions : ''} *
  if [ \$? -ne 0 ]; then
    echo "${func}[ERROR] failed on creating pax file"
    exit 1
  fi
else
  echo "${func}[ERROR] folder ${remoteWorkspaceFullPath}/${PATH_CONTENT} doesn't exist"
  exit 1
fi

# run post hook
cd "${remoteWorkspaceFullPath}"
if [ -f "${HOOK_POST_PACKAGING}" ]; then
  echo "${func} running post hook ..."
  iconv -f ISO8859-1 -t IBM-1047 ${HOOK_POST_PACKAGING} > ${HOOK_POST_PACKAGING}.new
  mv ${HOOK_POST_PACKAGING}.new ${HOOK_POST_PACKAGING}
  chmod +x ${HOOK_POST_PACKAGING}
  echo "${func} launch: ${environmentText} ./${HOOK_POST_PACKAGING}"
  ${environmentText} ./${HOOK_POST_PACKAGING}
  if [ \$? -ne 0 ]; then
    echo "${func}[ERROR] failed on post hook"
    exit 1
  fi
fi

# need to compress?
if [ "${compressPax ? 'YES' : 'NO'}" = "YES" ]; then
  echo "${func} compressing ${remoteWorkspaceFullPath}/${filePax} ..."
  compress ${compressOptions ? compressOptions : ''} "${remoteWorkspaceFullPath}/${filePax}"
fi

if [ -f "${remoteWorkspaceFullPath}/${filePax}" ]; then
  echo "${func} done"
  exit 0
elif [ -f "${remoteWorkspaceFullPath}/${filePaxZ}" ]; then
  echo "${func} done"
  exit 0
else
  echo "${func}[ERROR] failed to create PAX file ${remoteWorkspaceFullPath}/${filename}, exit."
  exit 1
fi
`

        //fs.writeFileSync('execute.sh',packageScriptContent)
        try {
            // run prepare-packaging hook if exists
            if (utils.fileExists(paxlocalWorkspace+'/'+HOOK_PREPARE_WORKSPACE)) {
                utils.sh "${environmentText} \"${this.localWorkspace}/${HOOK_PREPARE_WORKSPACE}\""
            }
            this.steps.sh "echo \"${func} packaging contents:\" && find ${this.localWorkspace} -print"
            // tar ascii folder if exists
            if (this.steps.fileExists("${this.localWorkspace}/${PATH_ASCII}")) {
                this.steps.sh """tar -c -f ${this.localWorkspace}/${PATH_ASCII}.tar -C ${this.localWorkspace}/ ${PATH_ASCII}
    rm -fr ${this.localWorkspace}/${PATH_ASCII}
    """
            }
            // tar the whole workspace folder
            this.steps.sh "tar -c -f ${packageTar} -C ${this.localWorkspace} ."
            this.steps.writeFile file: packageScriptFile, text: packageScriptContent
        } catch (ex0) {
            // throw error
            throw new PackageException("Failed to prepare packaging workspace: ${ex0}")
        }

        // this.steps.lock("packaging-server-${this.sshHost}") {
            this.steps.withCredentials([
                this.steps.usernamePassword(
                    credentialsId    : this.sshCredential,
                    passwordVariable : 'PASSWORD',
                    usernameVariable : 'USERNAME'
                )
            ]) {
                try {
                    // send to pax server
                    this.steps.sh """SSHPASS=\${PASSWORD} sshpass -e sftp -o BatchMode=no -o StrictHostKeyChecking=no -P ${this.sshPort} -b - \${USERNAME}@${this.sshHost} << EOF
    put ${packageTar} ${remoteWorkspace}
    put ${packageScriptFile} ${remoteWorkspace}
    EOF"""
                    // extract tar file, run pre/post hooks and create pax file
                    this.steps.sh """SSHPASS=\${PASSWORD} sshpass -e ssh -tt -o StrictHostKeyChecking=no -p ${this.sshPort} \${USERNAME}@${this.sshHost} << EOF
    iconv -f ISO8859-1 -t IBM-1047 ${remoteWorkspace}/${packageScriptFile} > ${remoteWorkspace}/${packageScriptFile}.new
    mv ${remoteWorkspace}/${packageScriptFile}.new ${remoteWorkspace}/${packageScriptFile}
    chmod +x ${remoteWorkspace}/${packageScriptFile}
    . ${remoteWorkspace}/${packageScriptFile}
    rm ${remoteWorkspace}/${packageScriptFile}
    exit 0
    EOF"""
                    // copy back pax file
                    String extraGets = ""
                    extraFiles.each {
                        extraGets += "\nget ${remoteWorkspaceFullPath}/${it} ${this.localWorkspace}"
                    }
                    this.steps.sh """SSHPASS=\${PASSWORD} sshpass -e sftp -o BatchMode=no -o StrictHostKeyChecking=no -P ${this.sshPort} -b - \${USERNAME}@${this.sshHost} << EOF
    get ${remoteWorkspaceFullPath}/${compressPax ? filePaxZ : filePax} ${this.localWorkspace}${extraGets}
    EOF"""
                } catch (ex1) {
                    // throw error
                    throw new PackageException("Pack Pax package failed: ${ex1}")
                } finally {
                    if (keepTempFolder) {
                        this.steps.echo "${func}[warning] remote workspace will be left as-is without clean-up."
                    } else {
                        try {
                            // run catch-all hooks
                            this.steps.echo "${func} running catch-all hooks..."
                            this.steps.sh """SSHPASS=\${PASSWORD} sshpass -e ssh -tt -o StrictHostKeyChecking=no -p ${this.sshPort} \${USERNAME}@${this.sshHost} << EOF
    cd "${remoteWorkspaceFullPath}"
    if [ -f "${HOOK_CATCHALL_PACKAGING}" ]; then
    echo "${func} running catch-all hook ..."
    iconv -f ISO8859-1 -t IBM-1047 ${HOOK_CATCHALL_PACKAGING} > ${HOOK_CATCHALL_PACKAGING}.new
    mv ${HOOK_CATCHALL_PACKAGING}.new ${HOOK_CATCHALL_PACKAGING}
    chmod +x ${HOOK_CATCHALL_PACKAGING}
    echo "${func} launch: ${environmentText} ./${HOOK_CATCHALL_PACKAGING}"
    ${environmentText} ./${HOOK_CATCHALL_PACKAGING}
    if [ \$? -ne 0 ]; then
    echo "${func}[ERROR] failed on catch-all hook"
    exit 1
    fi
    fi
    exit 0
    EOF"""
                        } catch (ex3) {
                            // ignore errors for cleaning up
                            this.log.finer("${func} running catch-all hooks failed: ${ex3}")
                        }

                        try {
                            // always clean up temporary files/folders
                            this.steps.echo "${func} cleaning up remote workspace..."
                            def resultCleaning = this.steps.sh(
                                script: "SSHPASS=\${PASSWORD} sshpass -e ssh -tt -o StrictHostKeyChecking=no -p ${this.sshPort} \${USERNAME}@${this.sshHost} \"rm -fr ${remoteWorkspaceFullPath}*\"",
                                returnStdout: true
                            )
                            this.log.finer("${func} cleaning up remote workspace returns: ${resultCleaning}")
                        } catch (ex2) {
                            // ignore errors for cleaning up
                            this.log.finer("${func} cleaning up remote workspace failed: ${ex2}")
                        }
                    }
                }
            } // end withCredentials
        // } // end lock

        return "${this.localWorkspace}/${compressPax ? filePaxZ : filePax}"
    }
}

module.exports = pax;