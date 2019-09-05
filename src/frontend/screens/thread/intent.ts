/* Copyright (C) 2018-2019 The Manyverse Authors.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import {Stream} from 'xstream';
import sample from 'xstream-sample';
import {isReplyPostMsg} from 'ssb-typescript/utils';
import {FeedId, Msg, MsgId} from 'ssb-typescript';
import {State} from './model';
import {SSBSource} from '../../drivers/ssb';
import {ReactSource} from '@cycle/react';
import {KeyboardSource} from 'cycle-native-keyboard';

type Likes = Array<FeedId> | null;

export default function intent(
  reactSource: ReactSource,
  keyboardSource: KeyboardSource,
  ssbSource: SSBSource,
  state$: Stream<State>,
) {
  return {
    publishMsg$: reactSource
      .select('replyButton')
      .events('press')
      .compose(sample(state$))
      .filter(state => !!state.replyText && !!state.rootMsgId),

    willReply$: ssbSource.publishHook$.filter(isReplyPostMsg),

    keyboardAppeared$: keyboardSource.events('keyboardDidShow').mapTo(null),

    keyboardDisappeared$: keyboardSource.events('keyboardDidHide').mapTo(null),

    goToAccounts$: reactSource.select('thread').events('pressLikeCount') as Stream<{
      msgKey: MsgId;
      likes: Likes;
    }>,

    likeMsg$: reactSource.select('thread').events('pressLike') as Stream<{
      msgKey: string;
      like: boolean;
    }>,

    openMessageEtc$: reactSource.select('thread').events('pressEtc') as Stream<
      Msg
    >,

    updateReplyText$: reactSource
      .select('replyInput')
      .events('changeText') as Stream<string>,

    goToProfile$: reactSource.select('thread').events('pressAuthor') as Stream<{
      authorFeedId: FeedId;
    }>,
  };
}
