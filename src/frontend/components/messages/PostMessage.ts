/* Copyright (C) 2018-2019 The Manyverse Authors.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import {PureComponent} from 'react';
import {h} from '@cycle/react';
import Markdown from '../Markdown';
import MessageContainer from './MessageContainer';
import MessageHeader from './MessageHeader';
import MessageFooter from './MessageFooter';
import ContentWarning from './ContentWarning';
import {PostContent as Post, FeedId, Msg, MsgId} from 'ssb-typescript';

type CWPost = Post & {contentWarning?: string};

type Likes = Array<FeedId> | null;

export type Props = {
  msg: Msg<Post>;
  name: string | null;
  imageUrl: string | null;
  likes: Array<FeedId> | null;
  selfFeedId: FeedId;
  onPressLikeCount?: (ev: {msgKey: MsgId; likes: Likes}) => void;
  onPressLike?: (ev: {msgKey: MsgId; like: boolean}) => void;
  onPressReply?: (ev: {msgKey: MsgId; rootKey: MsgId}) => void;
  onPressAuthor?: (ev: {authorFeedId: FeedId}) => void;
  onPressEtc?: (msg: Msg) => void;
};

type State = {
  cwOpened: boolean;
};

export default class PostMessage extends PureComponent<Props, State> {
  public state: State = {cwOpened: false};

  public onPressToggleCW = () => {
    this.setState(prev => ({cwOpened: !prev.cwOpened}));
  };

  public render() {
    const props = this.props;
    const {msg} = props;
    const cwMsg = msg as Msg<CWPost>;
    const hasCW =
      !!cwMsg.value.content.contentWarning &&
      typeof cwMsg.value.content.contentWarning === 'string';
    const opened = hasCW ? this.state.cwOpened : true;

    return h(MessageContainer, [
      h(MessageHeader, props),
      hasCW
        ? h(ContentWarning, {
            description: cwMsg.value.content.contentWarning!,
            opened,
            onPressToggle: this.onPressToggleCW,
          })
        : (null as any),
      opened ? Markdown(msg.value.content.text) : (null as any),
      h(MessageFooter, props),
    ]);
  }
}
