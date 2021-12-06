/*
 * This program and the accompanying materials are made available under the terms of the
 * Eclipse Public License v2.0 which accompanies this distribution, and is available at
 * https://www.eclipse.org/legal/epl-v20.html
 *
 * SPDX-License-Identifier: EPL-2.0
 *
 * Copyright IBM Corporation 2021
 */

const fs = require('fs')
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
     * @param   job                required - job identifier
     * @param   paxSSHHost         required - ssh host URL
     * @param   paxSSHPort         required - ssh port
     * @param   paxSSHUsername     required - ssh username
     * @param   paxSSHPassword     required - ssh password
     * @param   filename           required - package file name will be created
     * @param   paxLocalWorkspace  required - local path to prepare pax
     * @param   paxRemoteWorkspace required - remote path to prepare pax
     * @param   processUid         required - uid of temp file on zOS when doing pax
     * @param   paxOptions         optional - pax write command options
     * @param   extraFiles         optional - extra artifacts will be generated and should be transferred back;
     *                                        accept comma separated string or Array
     * @param   environments       optional - environment variables; key value pair map
     * @param   compress           optional - if we want to compress the result; will compress if value is not null
     * @param   compressOptions    optional - compress command options
     * @param   keepTempFolder     optional - if we want to keep the temporary packaging folder on the remote machine
     *                                        for debugging purpose. Default is not enabled. Will set to enabled when 
     *                                        the value is not null
     *
     * @return                     pax package created
     */

    static pack(args) {
        const func = 'pack:'
        
        const job = args.get('job')
        const paxSSHHost = args.get('paxSSHHost')
        const paxSSHPort = args.get('paxSSHPort')
        const paxSSHUsername = args.get('paxSSHUsername')
        const paxSSHPassword = args.get('paxSSHPassword')
        const filename = args.get('filename')
        const paxOptions = args.get('paxOptions')
        const extraFilesArg = args.get('extraFiles')
        var environmentText = args.get('environments')
        const compress = args.get('compress')
        const compressOptions = args.get('compressOptions')
        var keepTempFolderArg = args.get('keepTempFolder')

        var paxLocalWorkspace = args.get('paxLocalWorkspace')
        var paxRemoteWorkspace = args.get('paxRemoteWorkspace')
        var processUid = args.get('processUid')

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
        if (!paxLocalWorkspace){
            throw new InvalidArgumentException('paxLocalWorkspace')
        }
        if (!paxRemoteWorkspace){
            throw new InvalidArgumentException('paxRemoteWorkspace')
        }
        if (!processUid) {
            throw new InvalidArgumentException('processUid')
        }

        var keepTempFolder = false
        if (keepTempFolderArg) {
            keepTempFolder = true
        }
        var compressPax
        if (compress) {
            compressPax = 'YES'
        }

        var filePax = filename
        var filePaxZ = filename
        if (compressPax == 'YES') {
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
                throw new InvalidArgumentException('extraFiles', `extraFiles with type ${extraFilesArg.constructor.name} is not accepted`)
            }
        }
        var remoteWorkspaceFullPath = `${paxRemoteWorkspace}/${processUid}`
        var packageTar = `${processUid}.tar`
        var packageScriptFile = `${processUid}.sh`
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
        try {
            // run prepare-packaging hook if exists
            var prepareWorkspaceScriptFullPath = `${paxLocalWorkspace}/${HOOK_PREPARE_WORKSPACE}`
            if (utils.fileExists(prepareWorkspaceScriptFullPath)) {
                var cmds = new Array()
                cmds.push(environmentText)
                cmds.push(prepareWorkspaceScriptFullPath)
                debug(cmds.join(' '))
                utils.sh_heavyload(cmds.join(' '))   //use console to print output
                console.log('prepare workspace completed')
            }
            utils.sh_heavyload(`echo ${func} packaging contents: && find ${paxLocalWorkspace} -print`)
            
            // tar ascii folder if exists
            if (utils.fileExists(`${paxLocalWorkspace}/${PATH_ASCII}`)) {
                var cmds = new Array()
                cmds.push(`tar -c -f ${paxLocalWorkspace}/${PATH_ASCII}.tar -C ${paxLocalWorkspace}/ ${PATH_ASCII}`)
                cmds.push(`rm -fr ${paxLocalWorkspace}/${PATH_ASCII}`)
                debug(cmds.join(' && '))
                utils.sh_heavyload(cmds.join(' && '))    // use debug to optional print output
            }

            // tar the whole workspace folder
            utils.sh_heavyload(`tar -c -f ${packageTar} -C ${paxLocalWorkspace} .`)
            fs.writeFileSync(packageScriptFile, packageScriptContent)
        } catch (ex0) {
            throw new Error(`Failed to prepare packaging workspace: ${ex0}`)
        }

        try {
            // Step 1: send to pax server
            var cmd = `put ${packageTar} ${paxRemoteWorkspace}
put ${packageScriptFile} ${paxRemoteWorkspace}`
            utils.sftp(paxSSHHost,paxSSHPort,paxSSHUsername,paxSSHPassword,cmd)
            console.log(`[Step 1]: sftp put ${packageTar} and ${packageScriptFile} completed`)

            // Step 2: extract tar file, run pre/post hooks and create pax file
            var cmd2 = `iconv -f ISO8859-1 -t IBM-1047 ${paxRemoteWorkspace}/${packageScriptFile} > ${paxRemoteWorkspace}/${packageScriptFile}.new
mv ${paxRemoteWorkspace}/${packageScriptFile}.new ${paxRemoteWorkspace}/${packageScriptFile}
chmod +x ${paxRemoteWorkspace}/${packageScriptFile}
. ${paxRemoteWorkspace}/${packageScriptFile}
rm ${paxRemoteWorkspace}/${packageScriptFile}`
            utils.ssh(paxSSHHost,paxSSHPort,paxSSHUsername,paxSSHPassword,cmd2)
            console.log('[Step 2]: extract tar file, run pre/post hooks and create pax file completed')

            // Step 3: copy back pax files
            var extraGets = ''
            extraFiles.forEach(file =>
                extraGets += `
get ${remoteWorkspaceFullPath}/${file} ${paxLocalWorkspace}`
            )
            var cmd3 = `get ${remoteWorkspaceFullPath}/${compressPax ? filePaxZ : filePax} ${paxLocalWorkspace}`
            cmd3 += extraGets
            utils.sftp(paxSSHHost,paxSSHPort,paxSSHUsername,paxSSHPassword,cmd3)
            console.log('[Step 3]: copy back files completed')
        } catch (ex1) {
            // throw error
            throw new Error(`Pack Pax package failed: ${ex1}`)
        }

        return `${paxLocalWorkspace}/${compressPax ? filePaxZ : filePax}`
    } //PACK


    static paxCleanup(args) {

        const func = 'packCleanup:'
        const remoteWorkspaceFullPath = args.get('remoteWorkspaceFullPath')
        const paxSSHHost = args.get('paxSSHHost')
        const paxSSHPort = args.get('paxSSHPort')
        const paxSSHUsername = args.get('paxSSHUsername')
        const paxSSHPassword = args.get('paxSSHPassword')
        const keepTempFolder = args.get('keepTempFolder')
        var environmentText = args.get('environments')
        
        if (keepTempFolder == true) {
            console.warn(`${func}[warning] remote workspace will be left as-is without clean-up.`)
        } 
        else {
            try {
                // run catch-all hooks
                console.log(`${func} running catch-all hooks...`)
                var cmd = `cd "${remoteWorkspaceFullPath}"
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
    fi`
                utils.ssh(paxSSHHost,paxSSHPort,paxSSHUsername,paxSSHPassword,cmd)
            } catch (ex) {
                // ignore errors for cleaning up
                console.warn(`${func} running catch-all hooks failed: ${ex}`)
            }
            console.log('catch all hooks completed')
            try {
                // always clean up temporary files/folders
                console.log(`${func} cleaning up remote workspace...`)
                var cmdCleaning = `rm -fr ${remoteWorkspaceFullPath}*`
                utils.ssh(paxSSHHost,paxSSHPort,paxSSHUsername,paxSSHPassword,cmdCleaning)
                console.log(`${func} cleaning up remote workspace success`)
            } catch (ex2) {
                // ignore errors for cleaning up
                console.warn(`${func} cleaning up remote workspace failed: ${ex2}`)
            }
        } //ELSE
    }
}

module.exports = pax;