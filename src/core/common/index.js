/**
 * Copyright (c) 2018, 2019 National Digital ID COMPANY LIMITED
 *
 * This file is part of NDID software.
 *
 * NDID is the free software: you can redistribute it and/or modify it under
 * the terms of the Affero GNU General Public License as published by the
 * Free Software Foundation, either version 3 of the License, or any later
 * version.
 *
 * NDID is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 * See the Affero GNU General Public License for more details.
 *
 * You should have received a copy of the Affero GNU General Public License
 * along with the NDID source code. If not, see https://www.gnu.org/licenses/agpl.txt.
 *
 * Please contact info@ndid.co.th for any further questions
 *
 */

import { createRequestInternalAsyncAfterBlockchain } from './create_request';
import { closeRequestInternalAsyncAfterBlockchain } from './close_request';

import CustomError from '../../error/custom_error';
import logger from '../../logger';

import { role } from '../../node';
import * as tendermint from '../../tendermint';
import * as tendermintNdid from '../../tendermint/ndid';
import * as rp from '../rp';
import * as idp from '../idp';
import * as as from '../as';
import * as proxy from '../proxy';
import * as identity from '../identity';
import * as mq from '../../mq';
import {
  setShouldRetryFnGetter,
  setResponseCallbackFnGetter,
  resumeCallbackToClient,
  callbackToClient,
} from '../../utils/callback';
import * as utils from '../../utils';
import * as lt from '../../utils/long_timeout';
import * as config from '../../config';
import errorType from '../../error/type';
import { getErrorObjectForClient } from '../../error/helpers';
import * as cacheDb from '../../db/cache';
import privateMessageType from '../private_message_type';

export * from './create_request';
export * from './close_request';

let messageQueueAddressRegistered = !config.registerMqAtStartup;

tendermint.setTxResultCallbackFnGetter(getFunction);

export function registeredMsqAddress() {
  return messageQueueAddressRegistered;
}

async function registerMessageQueueAddress() {
  if (!messageQueueAddressRegistered) {
    //query current self msq
    const selfMqAddress = await tendermintNdid.getMsqAddress(config.nodeId);
    if (selfMqAddress) {
      const { ip, port } = selfMqAddress;
      //if not same
      if (ip !== config.mqRegister.ip || port !== config.mqRegister.port) {
        await tendermintNdid.registerMsqAddress(config.mqRegister);
        logger.info({
          message: 'Message queue address change registered',
        });
      } else {
        logger.info({
          message: 'Message queue address unchanged',
        });
      }
    } else {
      await tendermintNdid.registerMsqAddress(config.mqRegister);
      logger.info({
        message: 'Message queue address registered',
      });
    }
    messageQueueAddressRegistered = true;
  }
}

export async function initialize() {
  if (role === 'rp' || role === 'idp' || role === 'as') {
    await registerMessageQueueAddress();
    await mq.init();
    await mq.loadAndProcessBacklogMessages();
  }
  await tendermint.loadExpectedTxFromDB();

  let handleMessageFromQueue;
  if (role === 'rp') {
    handleMessageFromQueue = rp.handleMessageFromQueue;
    tendermint.setTendermintNewBlockEventHandler(rp.handleTendermintNewBlock);
    setShouldRetryFnGetter(getFunction);
    setResponseCallbackFnGetter(getFunction);
    resumeTimeoutScheduler();
    resumeCallbackToClient();
  } else if (role === 'idp') {
    handleMessageFromQueue = idp.handleMessageFromQueue;
    tendermint.setTendermintNewBlockEventHandler(idp.handleTendermintNewBlock);
    setShouldRetryFnGetter(getFunction);
    setResponseCallbackFnGetter(getFunction);
    resumeTimeoutScheduler();
    resumeCallbackToClient();
  } else if (role === 'as') {
    handleMessageFromQueue = as.handleMessageFromQueue;
    tendermint.setTendermintNewBlockEventHandler(as.handleTendermintNewBlock);
    setShouldRetryFnGetter(getFunction);
    setResponseCallbackFnGetter(getFunction);
    resumeCallbackToClient();
  } else if (role === 'proxy') {
    handleMessageFromQueue = proxy.handleMessageFromQueue;
    tendermint.setTendermintNewBlockEventHandler(
      proxy.handleTendermintNewBlock
    );
    setShouldRetryFnGetter(getFunction);
    setResponseCallbackFnGetter(getFunction);
    resumeTimeoutScheduler();
    resumeCallbackToClient();
  }

  if (handleMessageFromQueue) {
    mq.eventEmitter.on('message', handleMessageFromQueue);
  }
  mq.eventEmitter.on('error', handleMessageQueueError);
}

// tendermint.eventEmitter.on('ready', async () => {
//   if (
//     !config.useExternalCryptoService ||
//     (config.useExternalCryptoService &&
//       externalCryptoService.isCallbackUrlsSet())
//   ) {
//     await initialize();
//   }
// });

// if (config.useExternalCryptoService) {
//   externalCryptoService.eventEmitter.on('allCallbacksSet', async () => {
//     if (tendermint.syncing === false) {
//       await initialize();
//     }
//   });
// }

export function getFunction(fnName) {
  switch (fnName) {
    case 'common.createRequestInternalAsyncAfterBlockchain':
      return createRequestInternalAsyncAfterBlockchain;
    case 'common.closeRequestInternalAsyncAfterBlockchain':
      return closeRequestInternalAsyncAfterBlockchain;
    case 'common.isRequestClosedOrTimedOut':
      return isRequestClosedOrTimedOut;
    case 'idp.requestChallengeAfterBlockchain':
      return idp.requestChallengeAfterBlockchain;
    case 'idp.createResponseAfterBlockchain':
      return idp.createResponseAfterBlockchain;
    case 'idp.processIdpResponseAfterAddAccessor':
      return idp.processIdpResponseAfterAddAccessor;
    case 'as.afterGotDataFromCallback':
      return as.afterGotDataFromCallback;
    case 'as.registerOrUpdateASServiceInternalAsyncAfterBlockchain':
      return as.registerOrUpdateASServiceInternalAsyncAfterBlockchain;
    case 'as.processDataForRPInternalAsyncAfterBlockchain':
      return as.processDataForRPInternalAsyncAfterBlockchain;
    case 'identity.updateIalInternalAsyncAfterBlockchain':
      return identity.updateIalInternalAsyncAfterBlockchain;
    case 'identity.createIdentityInternalAsyncAfterCreateRequestBlockchain':
      return identity.createIdentityInternalAsyncAfterCreateRequestBlockchain;
    case 'identity.createIdentityInternalAsyncAfterBlockchain':
      return identity.createIdentityInternalAsyncAfterBlockchain;
    case 'identity.createIdentityInternalAsyncAfterExistedIdentityCheckBlockchain':
      return identity.createIdentityInternalAsyncAfterExistedIdentityCheckBlockchain;
    case 'identity.checkForExistedIdentityAfterBlockchain':
      return identity.checkForExistedIdentityAfterBlockchain;
    case 'identity.createIdentityInternalAsyncAfterClearMqDestTimeout':
      return identity.createIdentityInternalAsyncAfterClearMqDestTimeout;
    case 'identity.addAccessorAfterConsentAfterAddAccessorMethod':
      return identity.addAccessorAfterConsentAfterAddAccessorMethod;
    case 'identity.addAccessorAfterConsentAfterRegisterMqDest':
      return identity.addAccessorAfterConsentAfterRegisterMqDest;
    default:
      throw new CustomError({
        message: 'Unknown function name',
        details: {
          fnName,
        },
      });
  }
}

async function resumeTimeoutScheduler() {
  let scheduler = await cacheDb.getAllTimeoutScheduler();
  scheduler.forEach(({ requestId, unixTimeout }) =>
    runTimeoutScheduler(requestId, (unixTimeout - Date.now()) / 1000)
  );
}

export async function checkRequestMessageIntegrity(
  requestId,
  request,
  requestDetail
) {
  if (!requestDetail) {
    requestDetail = await tendermintNdid.getRequestDetail({ requestId });
  }

  const requestMessageHash = utils.hash(
    request.request_message + request.request_message_salt
  );

  const requestMessageValid =
    requestMessageHash === requestDetail.request_message_hash;
  if (!requestMessageValid) {
    logger.warn({
      message: 'Request message hash mismatched',
      requestId,
    });
    logger.debug({
      message: 'Request message hash mismatched',
      requestId,
      givenRequestMessage: request.request_message,
      givenRequestMessageHashWithSalt: requestMessageHash,
      requestMessageHashFromBlockchain: requestDetail.request_message_hash,
    });
    return false;
  }
  return true;
}

export async function checkDataRequestParamsIntegrity(
  requestId,
  request,
  requestDetail
) {
  if (!requestDetail) {
    requestDetail = await tendermintNdid.getRequestDetail({ requestId });
  }

  for (let i = 0; i < requestDetail.data_request_list.length; i++) {
    const dataRequest = requestDetail.data_request_list[i];
    const dataRequestParamsHash = utils.hash(
      request.data_request_list[i].request_params +
        request.data_request_params_salt_list[i]
    );
    const dataRequestParamsValid =
      dataRequest.request_params_hash === dataRequestParamsHash;
    if (!dataRequestParamsValid) {
      logger.warn({
        message: 'Request data request params hash mismatched',
        requestId,
      });
      logger.debug({
        message: 'Request data request params hash mismatched',
        requestId,
        givenRequestParams: dataRequest.request_params,
        givenRequestParamsHashWithSalt: dataRequestParamsHash,
        requestParamsHashFromBlockchain: dataRequest.request_params_hash,
      });
      return false;
    }
  }
  return true;
}

export async function checkRequestIntegrity(requestId, request) {
  const requestDetail = await tendermintNdid.getRequestDetail({ requestId });

  const requestMessageValid = checkRequestMessageIntegrity(
    requestId,
    request,
    requestDetail
  );

  const dataRequestParamsValid = checkDataRequestParamsIntegrity(
    requestId,
    request,
    requestDetail
  );

  return requestMessageValid && dataRequestParamsValid;
}

async function handleMessageQueueError(error) {
  const err = new CustomError({
    message: 'Message queue receiving error',
    cause: error,
  });
  logger.error(err.getInfoForLog());
  let callbackUrl;
  if (role === 'rp') {
    callbackUrl = rp.getErrorCallbackUrl();
  } else if (role === 'idp') {
    callbackUrl = idp.getErrorCallbackUrl();
  } else if (role === 'as') {
    callbackUrl = as.getErrorCallbackUrl();
  }
  await notifyError({
    callbackUrl,
    action: 'onMessage',
    error: err,
  });
}

export async function getIdpsMsqDestination({
  namespace,
  identifier,
  min_ial,
  min_aal,
  idp_id_list,
  mode,
}) {
  const idpNodes = await tendermintNdid.getIdpNodesInfo({
    namespace: mode === 3 ? namespace : undefined,
    identifier: mode === 3 ? identifier : undefined,
    min_ial,
    min_aal,
    node_id_list: idp_id_list, // filter to include only nodes in this list if node ID exists
  });

  const receivers = idpNodes.map((idpNode) => {
    if (idpNode.proxy != null) {
      return {
        node_id: idpNode.node_id,
        public_key: idpNode.public_key,
        proxy: {
          node_id: idpNode.proxy.node_id,
          public_key: idpNode.proxy.public_key,
          ip: idpNode.proxy.mq.ip,
          port: idpNode.proxy.mq.port,
        },
      };
    } else {
      return {
        node_id: idpNode.node_id,
        public_key: idpNode.public_key,
        ip: idpNode.mq.ip,
        port: idpNode.mq.port,
      };
    }
  });
  return receivers;
}

//=========================================== Request related ========================================

export let timeoutScheduler = {};

export function stopAllTimeoutScheduler() {
  for (let nodeIdAndrequestId in timeoutScheduler) {
    lt.clearTimeout(timeoutScheduler[nodeIdAndrequestId]);
  }
}

export async function timeoutRequest(nodeId, requestId) {
  try {
    const responseValidList = await cacheDb.getIdpResponseValidList(
      nodeId,
      requestId
    );

    // FOR DEBUG
    const nodeIds = {};
    for (let i = 0; i < responseValidList.length; i++) {
      if (nodeIds[responseValidList[i].idp_id]) {
        logger.error({
          message: 'Duplicate IdP ID in response valid list',
          requestId,
          responseValidList,
          action: 'timeoutRequest',
        });
        break;
      }
      nodeIds[responseValidList[i].idp_id] = true;
    }

    await tendermintNdid.timeoutRequest(
      { requestId, responseValidList },
      nodeId
    );
  } catch (error) {
    logger.error({
      message: 'Cannot set timed out',
      requestId,
      error,
    });
    throw error;
  }
  cacheDb.removeTimeoutScheduler(nodeId, requestId);
  cacheDb.removeChallengeFromRequestId(nodeId, requestId);
}

export function runTimeoutScheduler(nodeId, requestId, secondsToTimeout) {
  if (secondsToTimeout < 0) {
    timeoutRequest(nodeId, requestId);
  } else {
    timeoutScheduler[`${nodeId}:${requestId}`] = lt.setTimeout(() => {
      timeoutRequest(nodeId, requestId);
    }, secondsToTimeout * 1000);
  }
}

export async function setTimeoutScheduler(nodeId, requestId, secondsToTimeout) {
  let unixTimeout = Date.now() + secondsToTimeout * 1000;
  await cacheDb.setTimeoutScheduler(nodeId, requestId, unixTimeout);
  runTimeoutScheduler(nodeId, requestId, secondsToTimeout);
}

export async function removeTimeoutScheduler(nodeId, requestId) {
  lt.clearTimeout(timeoutScheduler[`${nodeId}:${requestId}`]);
  await cacheDb.removeTimeoutScheduler(nodeId, requestId);
  delete timeoutScheduler[`${nodeId}:${requestId}`];
}

async function verifyZKProof({
  request_id,
  idp_id,
  requestData,
  response,
  accessor_public_key,
  privateProofObject,
  challenge,
  mode,
}) {
  const { namespace, identifier, privateProofObjectList } = requestData;

  if (mode === 1) {
    return null;
  }

  logger.debug({
    message: 'Verifying zk proof',
    request_id,
    idp_id,
    challenge,
    privateProofObject,
    mode,
  });

  //query accessor_group_id of this accessor_id
  const accessor_group_id = await tendermintNdid.getAccessorGroupId(
    privateProofObject.accessor_id
  );

  logger.debug({
    message: 'Verifying zk proof',
    privateProofObjectList,
  });

  //and check against all accessor_group_id of responses
  for (let i = 0; i < privateProofObjectList.length; i++) {
    let otherPrivateProofObject = privateProofObjectList[i].privateProofObject;
    let otherGroupId = await tendermintNdid.getAccessorGroupId(
      otherPrivateProofObject.accessor_id
    );
    if (otherGroupId !== accessor_group_id) {
      logger.debug({
        message: 'Conflict response',
        otherGroupId,
        otherPrivateProofObject,
        accessor_group_id,
        accessorId: privateProofObject.accessor_id,
      });

      throw new CustomError({
        errorType: errorType.DIFFERENT_ACCESSOR_GROUP_ID,
        details: {
          accessorId: privateProofObject.accessor_id,
          accessor_group_id,
          otherGroupId,
        },
      });
    }
  }

  const publicProof = JSON.parse(response.identity_proof);
  const privateProofValueHash = response.private_proof_hash;

  return utils.verifyZKProof(
    accessor_public_key,
    challenge,
    privateProofObject.privateProofValueArray,
    publicProof,
    {
      namespace,
      identifier,
    },
    privateProofValueHash,
    privateProofObject.padding
  );
}

//===== zkp and request related =====

export async function handleChallengeRequest({
  nodeId,
  request_id,
  idp_id,
  public_proof,
}) {
  logger.debug({
    message: 'Handle challenge request',
    nodeId,
    request_id,
    idp_id,
    public_proof,
  });

  //const [request_id, idp_id] = responseId.split(':');

  //get public proof in blockchain
  const public_proof_blockchain = JSON.parse(
    await tendermintNdid.getIdentityProof(request_id, idp_id)
  );

  //check public proof in blockchain and in message queue
  if (public_proof_blockchain.length !== public_proof.length) return;
  for (let i = 0; i < public_proof.length; i++) {
    if (public_proof_blockchain[i] !== public_proof[i]) return;
  }

  //if match, send challenge and return
  const nodeIdObj = {};
  if (role === 'idp') nodeIdObj.idp_id = nodeId;
  else if (role === 'rp') nodeIdObj.rp_id = nodeId;

  let challenge;
  let challengeObject = await cacheDb.getChallengeFromRequestId(
    nodeId,
    request_id
  );
  //challenge deleted, request is done
  if (challengeObject == null) return;

  if (challengeObject[idp_id]) challenge = challengeObject[idp_id];
  else {
    //generate new challenge
    challenge = [
      utils.randomBase64Bytes(config.challengeLength),
      utils.randomBase64Bytes(config.challengeLength),
    ];

    challengeObject[idp_id] = challenge;
    await cacheDb.setChallengeFromRequestId(
      nodeId,
      request_id,
      challengeObject
    );
  }

  logger.debug({
    message: 'Get challenge',
    challenge,
  });

  const nodeInfo = await tendermintNdid.getNodeInfo(idp_id);
  if (nodeInfo == null) {
    throw new CustomError({
      errorType: errorType.NODE_INFO_NOT_FOUND,
      details: {
        request_id,
      },
    });
  }

  if (nodeInfo.mq == null) {
    throw new CustomError({
      errorType: errorType.MESSAGE_QUEUE_ADDRESS_NOT_FOUND,
      details: {
        request_id,
      },
    });
  }

  let receivers;
  if (nodeInfo.proxy != null) {
    receivers = [
      {
        node_id: idp_id,
        public_key: nodeInfo.public_key,
        proxy: {
          node_id: nodeInfo.proxy.node_id,
          public_key: nodeInfo.proxy.public_key,
          ip: nodeInfo.proxy.mq.ip,
          port: nodeInfo.proxy.mq.port,
        },
      },
    ];
  } else {
    receivers = [
      {
        node_id: idp_id,
        public_key: nodeInfo.public_key,
        ip: nodeInfo.mq.ip,
        port: nodeInfo.mq.port,
      },
    ];
  }
  mq.send(
    receivers,
    {
      type: privateMessageType.CHALLENGE_RESPONSE,
      challenge,
      request_id,
      ...nodeIdObj,
    },
    nodeId
  );
}

export async function checkIdpResponse({
  nodeId,
  requestStatus,
  idpId,
  responseIal,
  requestDataFromMq,
}) {
  logger.debug({
    message: 'Checking IdP response (ZK Proof, IAL)',
    requestStatus,
    idpId,
    responseIal,
    requestDataFromMq,
  });

  let validIal;

  const requestId = requestStatus.request_id;

  // Check IAL
  const requestData = await cacheDb.getRequestData(nodeId, requestId);
  const identityInfo = await tendermintNdid.getIdentityInfo(
    requestData.namespace,
    requestData.identifier,
    idpId
  );

  if (requestStatus.mode === 1) {
    validIal = null; // Cannot check in mode 1
  } else if (requestStatus.mode === 3) {
    if (responseIal === identityInfo.ial) {
      validIal = true;
    } else {
      validIal = false;
    }
  }

  const privateProofObject = requestDataFromMq
    ? requestDataFromMq
    : await cacheDb.getPrivateProofReceivedFromMQ(
        nodeId,
        nodeId + ':' + requestStatus.request_id + ':' + idpId
      );

  const accessor_public_key = await tendermintNdid.getAccessorKey(
    privateProofObject.accessor_id
  );

  const response_list = (await tendermintNdid.getRequestDetail({
    requestId: requestStatus.request_id,
  })).response_list;
  const response = response_list.find((response) => response.idp_id === idpId);

  // Check ZK Proof
  const challenge = (await cacheDb.getChallengeFromRequestId(
    nodeId,
    requestStatus.request_id
  ))[idpId];
  const validProof = await verifyZKProof({
    request_id: requestStatus.request_id,
    idp_id: idpId,
    requestData,
    response,
    accessor_public_key,
    privateProofObject,
    challenge,
    mode: requestStatus.mode,
  });

  logger.debug({
    message: 'Checked ZK proof and IAL',
    requestId,
    idpId,
    validProof,
    validIal,
  });

  // Check signature
  let signatureValid;
  if (requestStatus.mode === 1) {
    signatureValid = null; // Cannot check in mode 1
  } else if (requestStatus.mode === 3) {
    const { request_message, initial_salt, request_id } = requestData;
    const signature = response.signature;

    logger.debug({
      message: 'Verifying signature',
      request_message,
      initial_salt,
      accessor_public_key,
      signature,
    });

    signatureValid = utils.verifyResponseSignature(
      signature,
      accessor_public_key,
      request_message,
      initial_salt,
      request_id
    );
  }

  const responseValid = {
    idp_id: idpId,
    valid_signature: signatureValid,
    valid_proof: validProof,
    valid_ial: validIal,
  };

  await cacheDb.addIdpResponseValidList(nodeId, requestId, responseValid);

  cacheDb.removePrivateProofReceivedFromMQ(
    nodeId,
    `${nodeId}:${requestStatus.request_id}:${idpId}`
  );

  return responseValid;
}

/**
 * Returns false if request is closed or timed out
 * @param {string} requestId
 * @returns {boolean}
 */
export async function isRequestClosedOrTimedOut(requestId) {
  if (requestId) {
    const requestDetail = await tendermintNdid.getRequestDetail({ requestId });
    if (requestDetail.closed || requestDetail.timed_out) {
      return false;
    }
  }
  return true;
}

export async function notifyError({ callbackUrl, action, error, requestId }) {
  logger.debug({
    message: 'Notifying error through callback',
  });
  if (callbackUrl == null) {
    logger.warn({
      message: 'Error callback URL has not been set',
    });
    return;
  }
  await callbackToClient(
    callbackUrl,
    {
      type: 'error',
      action,
      request_id: requestId,
      error: getErrorObjectForClient(error),
    },
    false
  );
}
