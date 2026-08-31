"""Validated, versioned draft metadata; keep the contract aligned with draft_bundle.mjs."""
import json


def normalize_draft_bundle(value):
    if not isinstance(value, dict) or type(value.get('version')) is not int or value.get('version') != 1:
        raise ValueError('지원하지 않는 글서랍 저장 형식입니다.')
    if value.get('article_mode') not in ('keyword', 'story'):
        raise ValueError('글쓰기 유형이 올바르지 않습니다.')

    def string(value, maximum):
        if value is None:
            return ''
        if not isinstance(value, str) or len(value) > maximum:
            raise ValueError('저장할 프롬프트 또는 입력 내용이 허용 길이를 초과했습니다.')
        return value

    def board(value):
        if value is None:
            return []
        if not isinstance(value, list) or len(value) > 4:
            raise ValueError('스토리보드는 최대 4컷까지 저장할 수 있습니다.')
        result = []
        for index, item in enumerate(value):
            if not isinstance(item, dict):
                raise ValueError('4컷 데이터 형식이 올바르지 않습니다.')
            result.append(dict(cut=index + 1, time=string(item.get('time'), 100), role=string(item.get('role'), 200),
                               conceptKo=string(item.get('conceptKo'), 4000), promptEn=string(item.get('promptEn'), 6000)))
        return result

    source = value.get('story_input') or {}
    if not isinstance(source, dict):
        raise ValueError('메모 입력 형식이 올바르지 않습니다.')
    result = dict(version=1, article_mode=value['article_mode'], keyword=string(value.get('keyword'), 500),
                  illustration_storyboard=board(value.get('illustration_storyboard')), shorts_storyboard=board(value.get('shorts_storyboard')),
                  story_input={key: string(source.get(key), maximum) for key, maximum in [('title', 300), ('content', 50000), ('request', 10000), ('type', 100)]} if value['article_mode'] == 'story' else {})
    if len(json.dumps(result, ensure_ascii=False, separators=(',', ':')).encode('utf-8')) > 200000:
        raise ValueError('프롬프트와 메모의 저장 용량은 200KB 이내여야 합니다.')
    return result


def read_draft_bundle(value):
    try:
        return normalize_draft_bundle(json.loads(value) if isinstance(value, str) else value)
    except (ValueError, TypeError):
        return dict(version=0, article_mode=None, keyword='', illustration_storyboard=[], shorts_storyboard=[], story_input={})


def draft_bundle_summary(value):
    bundle = read_draft_bundle(value)
    return dict(article_mode=bundle['article_mode'], illustration_count=len(bundle['illustration_storyboard']), shorts_count=len(bundle['shorts_storyboard']))
