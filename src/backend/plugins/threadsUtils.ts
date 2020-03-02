/* Copyright (C) 2020 The Manyverse Authors.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const pull = require('pull-stream');
const Ref = require('ssb-ref');
import {Thread as ThreadData} from 'ssb-threads/types';
import {Msg, Content, FeedId} from 'ssb-typescript';
import {
  isMsg,
  isRootPostMsg,
  isPublic,
  isReplyPostMsg,
} from 'ssb-typescript/utils';
import run = require('promisify-tuple');
import {
  AnyThread,
  MsgAndExtras,
  ThreadAndExtras,
  PrivateThreadAndExtras,
} from '../../shared-types';
import {imageToImageUrl} from './helpers/about';
import {Callback} from './helpers/types';
const clone = require('rfdc')();

function getRecipient(recp: string | Record<string, any>): string | undefined {
  if (typeof recp === 'object' && Ref.isFeed(recp.link)) {
    return recp.link;
  }
  if (typeof recp === 'string' && Ref.isFeed(recp)) {
    return recp;
  }
}

function mutateMsgWithLiveExtras(ssb: any) {
  const getAbout = ssb.cachedAbout.socialValue;
  return async (msg: Msg, cb: Callback<MsgAndExtras>) => {
    if (!isMsg(msg) || !msg.value) return cb(null, msg as any);

    // Fetch name
    const nameOpts = {key: 'name', dest: msg.value.author};
    const [e1, name] = await run<string | undefined>(getAbout)(nameOpts);
    if (e1) return cb(e1);

    // Fetch avatar
    const avatarOpts = {key: 'image', dest: msg.value.author};
    const [e2, val] = await run(getAbout)(avatarOpts);
    if (e2) return cb(e2);
    const imageUrl = imageToImageUrl(val);

    // Get likes stream
    // FIXME: do this in a frontend plugin
    // - publicRawFeed()
    // - publicFeed()
    // x NOT for privateFeed() I guess?
    // - selfPublicRoots()
    // x NOT for selfPrivateRoots I guess?
    // - selfReplies
    // - profileFeed
    // x NOT for threadUpdates, but maybe in the future we should, when this is used for public too
    // - thread
    // const likes = xsFromPullStream(ssb.votes.voterStream(msg.key)).startWith(
    //   [],
    // );

    // Create msg object
    const m = msg as MsgAndExtras;
    m.value._$manyverse$metadata = m.value._$manyverse$metadata || {
      // likes, // FIXME: do this in a frontend plugin
      about: {name, imageUrl},
    };

    // Add name of the target contact, if any
    const content = msg.value.content;
    if (!content || content.type !== 'contact' || !content.contact) {
      return cb(null, m);
    }
    const dest: FeedId = content.contact;
    const dOpts = {key: 'name', dest};
    const [e3, destName] = await run<string | undefined>(getAbout)(dOpts);
    if (e3) return cb(e3);
    m.value._$manyverse$metadata.contact = {name: destName};
    cb(null, m);
  };
}

function mutateThreadWithLiveExtras(ssb: any) {
  return async (thread: ThreadData, cb: Callback<ThreadAndExtras>) => {
    for (const msg of thread.messages) {
      await run(mutateMsgWithLiveExtras(ssb))(msg);
    }
    cb(null, thread as ThreadAndExtras);
  };
}

function mutatePrivateThreadWithLiveExtras(ssb: any) {
  const getAbout = ssb.cachedAbout.socialValue;
  return async (thread: ThreadData, cb: Callback<PrivateThreadAndExtras>) => {
    for (const msg of thread.messages) {
      await run(mutateMsgWithLiveExtras(ssb))(msg);
    }
    const root: Msg<Content> | undefined = thread.messages[0];
    const pvthread: PrivateThreadAndExtras = thread as any;
    if (root && root?.value?.content?.recps) {
      pvthread.recps = [];
      for (const recp of root?.value?.content?.recps) {
        const id = getRecipient(recp);
        if (!id) continue;

        // Fetch name
        const nameOpts = {key: 'name', dest: id};
        const [e1, name] = await run<string | undefined>(getAbout)(nameOpts);
        if (e1) return cb(e1);

        // Fetch avatar
        const avatarOpts = {key: 'image', dest: id};
        const [e2, val] = await run<string>(getAbout)(avatarOpts);
        if (e2) return cb(e2);
        const imageUrl = imageToImageUrl(val);

        // Push
        pvthread.recps.push({id, name, imageUrl});
      }
    }
    cb(null, pvthread as PrivateThreadAndExtras);
  };
}

export = {
  name: 'threadsUtils',
  version: '1.0.0',
  manifest: {
    publicRawFeed: 'source',
    publicFeed: 'source',
    privateFeed: 'source',
    selfPublicRoots: 'source',
    selfPrivateRoots: 'source',
    selfReplies: 'source',
    profileFeed: 'source',
    threadUpdates: 'source',
    thread: 'async',
  },
  permissions: {
    master: {
      allow: [
        'publicRawFeed',
        'publicFeed',
        'privateFeed',
        'selfPublicRoots',
        'selfPrivateRoots',
        'selfReplies',
        'profileFeed',
        'threadUpdates',
        'thread',
      ],
    },
  },
  init: function init(ssb: any, _config: any) {
    return {
      publicRawFeed(opts: any) {
        return pull(
          ssb.createFeedStream({reverse: true, live: false, ...opts}),
          pull.asyncMap(mutateMsgWithLiveExtras(ssb)),
        );
      },

      publicFeed(opts: any) {
        return pull(
          ssb.threads.public({
            threadMaxSize: 3,
            allowlist: ['post', 'contact'],
            ...opts,
          }),
          pull.map(clone),
          pull.asyncMap(mutateThreadWithLiveExtras(ssb)),
        );
      },

      privateFeed(opts: any) {
        return pull(
          ssb.threads.private({threadMaxSize: 1, allowlist: ['post'], ...opts}),
          pull.map(clone),
          pull.asyncMap(mutatePrivateThreadWithLiveExtras(ssb)),
        );
      },

      selfPublicRoots(opts: any) {
        return pull(
          ssb.createUserStream({id: ssb.id, ...opts}),
          pull.filter(isRootPostMsg),
          pull.filter(isPublic),
          pull.map((msg: Msg) => ({messages: [msg], full: true} as ThreadData)),
          pull.asyncMap(mutateThreadWithLiveExtras(ssb)),
        );
      },

      selfPrivateRoots() {
        return pull(
          ssb.threads.private({
            threadMaxSize: 1,
            allowlist: ['post'],
            old: false,
            live: true,
          }),
          pull.map((thread: ThreadData) => thread?.messages?.[0]),
          pull.filter((msg: Msg) => msg?.value?.author === ssb.id),
        );
      },

      selfReplies(opts: any) {
        return pull(
          ssb.createUserStream({id: ssb.id, ...opts}),
          pull.filter(isReplyPostMsg),
          pull.filter(isPublic),
          pull.asyncMap(mutateMsgWithLiveExtras(ssb)),
        );
      },

      profileFeed(id: FeedId, opts: any) {
        return pull(
          ssb.threads.profile({
            id,
            reverse: true,
            live: false,
            threadMaxSize: 3,
            allowlist: ['post', 'contact'],
            ...opts,
          }),
          pull.asyncMap(mutateThreadWithLiveExtras(ssb)),
        );
      },

      threadUpdates(opts: {root: FeedId; private: boolean}) {
        return pull(
          ssb.threads.threadUpdates(opts),
          pull.asyncMap(mutateMsgWithLiveExtras(ssb)),
        );
      },

      thread(opts: {root: FeedId; private: boolean}, cb: Callback<AnyThread>) {
        pull(
          ssb.threads.thread(opts),
          pull.asyncMap((t: ThreadData, cb2: Callback<AnyThread>) => {
            if (opts.private) {
              mutatePrivateThreadWithLiveExtras(ssb)(t, cb2);
            } else {
              mutateThreadWithLiveExtras(ssb)(t, cb2);
            }
          }),
          pull.take(1),
          pull.drain(
            (thread: AnyThread) => cb(null, thread),
            (err: any) => (err ? cb(err) : void 0),
          ),
        );
      },
    };
  },
};
