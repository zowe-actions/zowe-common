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
}

module.exports = github;