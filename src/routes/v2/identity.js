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

import express from 'express';

import { validateBody } from '../middleware/validation';
import * as identity from '../../core/identity';
import * as common from '../../core/common';
import * as tendermintNdid from '../../tendermint/ndid';

import errorType from '../../error/type';

const router = express.Router();

router.post('/', validateBody, async (req, res, next) => {
  try {
    const {
      reference_id,
      callback_url,
      namespace,
      identifier,
      accessor_type,
      accessor_public_key,
      accessor_id,
      ial,
    } = req.body;

    const result = await identity.createNewIdentity(
      {
        reference_id,
        callback_url,
        namespace,
        identifier,
        accessor_type,
        accessor_public_key,
        accessor_id,
        ial,
      },
      { synchronous: false }
    );

    res.status(202).json(result);
  } catch (error) {
    next(error);
  }
});

router.post(
  '/:namespace/:identifier/accessors',
  validateBody,
  async (req, res, next) => {
    try {
      const {
        reference_id,
        callback_url,
        accessor_type,
        accessor_public_key,
        accessor_id,
      } = req.body;

      const { namespace, identifier } = req.params;

      const result = await identity.addAccessorMethodForAssociatedIdp(
        {
          reference_id,
          callback_url,
          namespace,
          identifier,
          accessor_type,
          accessor_public_key,
          accessor_id,
        },
        { synchronous: false }
      );

      res.status(202).json(result);
    } catch (error) {
      if (error.code === errorType.IDENTITY_NOT_FOUND.code) {
        res.status(404).end();
        return;
      }
      next(error);
    }
  }
);

router.get('/:namespace/:identifier', async (req, res, next) => {
  try {
    const { namespace, identifier } = req.params;

    const idpNodes = await tendermintNdid.getIdpNodes({
      namespace,
      identifier,
      min_ial: 0,
      min_aal: 0,
    });

    if (idpNodes.length !== 0) {
      res.status(204).end();
    } else {
      res.status(404).end();
    }
  } catch (error) {
    next(error);
  }
});

router.post(
  '/:namespace/:identifier/ial',
  validateBody,
  async (req, res, next) => {
    try {
      const { namespace, identifier } = req.params;
      const { reference_id, callback_url, ial } = req.body;
      await identity.updateIal(
        {
          reference_id,
          callback_url,
          namespace,
          identifier,
          ial,
        },
        { synchronous: false }
      );
      res.status(202).end();
    } catch (error) {
      next(error);
    }
  }
);

router.post('/:namespace/:identifier', validateBody, async (req, res, next) => {
  try {
    const { namespace, identifier } = req.params;
    const { reference_id, callback_url, identifier_list } = req.body;

    // Not Implemented
    // TODO

    res.status(501).end();
  } catch (error) {
    next(error);
  }
});

router.get('/:namespace/:identifier/endorsement', async (req, res, next) => {
  try {
    const { namespace, identifier } = req.params;

    // Not Implemented
    // TODO

    res.status(501).end();
  } catch (error) {
    next(error);
  }
});

router.post(
  '/:namespace/:identifier/endorsement',
  validateBody,
  async (req, res, next) => {
    try {
      const { namespace, identifier } = req.params;
      const {
        reference_id,
        callback_url,
        accessor_type,
        accessor_key,
        accessor_id,
      } = req.body;

      // Not Implemented
      // TODO

      res.status(501).end();
    } catch (error) {
      next(error);
    }
  }
);

router.post('/requests/close', validateBody, async (req, res, next) => {
  try {
    const { reference_id, callback_url, request_id } = req.body;

    await common.closeRequest(
      { reference_id, callback_url, request_id },
      { synchronous: false }
    );
    res.status(202).end();
  } catch (error) {
    next(error);
  }
});

export default router;
